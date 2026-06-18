const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });
const games = {};

console.log(`WebSocket server starting on port ${PORT}`);

wss.on('connection', ws => {
    console.log('New client connected');

    ws.on('message', message => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error("Invalid JSON received");
            return;
        }

        switch (data.type) {
            case 'createGame': {
                const sessionId = data.sessionId;
                const username = data.username || 'Anonymous';
                
                ws.sessionId = sessionId;
                ws.playerColor = 'white';
                ws.username = username;

                games[sessionId] = {
                    players: [ws]
                };

                ws.send(JSON.stringify({
                    type: 'gameCreated',
                    sessionId: sessionId,
                    playerColor: 'white',
                    username: username
                }));
                console.log(`Game ${sessionId} created by ${username}`);
                break;
            }

            case 'joinGame': {
                const sessionId = data.sessionId;
                const username = data.username || 'Anonymous';
                const game = games[sessionId];

                if (game && game.players.length === 1) {
                    ws.sessionId = sessionId;
                    ws.playerColor = 'black';
                    ws.username = username;
                    
                    game.players.push(ws);

                    const creator = game.players[0];

                    // Notify creator (White) that opponent (Black) joined
                    creator.send(JSON.stringify({
                        type: 'opponentJoined',
                        sessionId: sessionId,
                        opponentName: username,
                        opponentColor: 'black'
                    }));

                    // Notify joiner (Black) that they joined the creator (White)
                    ws.send(JSON.stringify({
                        type: 'gameJoined',
                        sessionId: sessionId,
                        playerColor: 'black',
                        opponentName: creator.username,
                        username: username
                    }));
                    
                    console.log(`${username} joined game: ${sessionId}`);
                } else {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        message: 'Game not found or is full.' 
                    }));
                }
                break;
            }

            case 'makeMove': {
                const sessionId = data.sessionId;
                const game = games[sessionId];

                if (game) {
                    // Forward the complete move payload to the other player
                    game.players.forEach(player => {
                        if (player !== ws && player.readyState === WebSocket.OPEN) {
                            player.send(JSON.stringify({
                                ...data,            // Spread data FIRST
                                type: 'moveMade'    // Explicitly override type to 'moveMade' LAST
                            }));
                        }
                    });
                }
                break;
            }

            case 'endGame': {
                const sessionId = data.sessionId;
                const game = games[sessionId];
                const username = data.username || 'Player';

                if (game) {
                    game.players.forEach(player => {
                        if (player.readyState === WebSocket.OPEN) {
                            player.send(JSON.stringify({
                                type: 'gameEnded',
                                reason: 'ended',
                                endedBy: username
                            }));
                        }
                    });
                    delete games[sessionId];
                    console.log(`Game ${sessionId} ended by ${username}`);
                }
                break;
            }

            case 'resign': {
                const sessionId = data.sessionId;
                const game = games[sessionId];
                const username = data.username || 'Player';
                const playerColor = data.playerColor;

                if (game) {
                    const winnerColor = playerColor === 'white' ? 'black' : 'white';
                    const creator = game.players[0];
                    const joiner = game.players[1];
                    const winnerUsername = winnerColor === 'white' ? creator.username : joiner.username;

                    game.players.forEach(player => {
                        if (player.readyState === WebSocket.OPEN) {
                            player.send(JSON.stringify({
                                type: 'gameEnded',
                                reason: 'resigned',
                                winner: winnerUsername,
                                loser: username
                            }));
                        }
                    });
                    delete games[sessionId];
                    console.log(`Game ${sessionId} - ${username} resigned.`);
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        const sessionId = ws.sessionId;
        if (sessionId && games[sessionId]) {
            const game = games[sessionId];
            game.players = game.players.filter(p => p !== ws);

            if (game.players.length > 0) {
                game.players[0].send(JSON.stringify({ 
                    type: 'playerDisconnected',
                    username: ws.username || 'Opponent'
                }));
            } else {
                delete games[sessionId];
                console.log(`Game ${sessionId} closed.`);
            }
        }
    });
});
