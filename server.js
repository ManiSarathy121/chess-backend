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
                games[sessionId] = {
                    players: [ws], 
                    playerColors: { [ws._socket.remoteAddress]: 'white' } 
                };
                ws.sessionId = sessionId; 

                ws.send(JSON.stringify({
                    type: 'gameCreated',
                    sessionId: sessionId,
                    playerColor: 'white'
                }));
                console.log(`Game created: ${sessionId}`);
                break;
            }

            case 'joinGame': {
                const sessionId = data.sessionId;
                const game = games[sessionId];

                if (game && game.players.length === 1) {
                    game.players.push(ws);
                    ws.sessionId = sessionId;

                    game.players[0].send(JSON.stringify({
                        type: 'gameJoined',
                        sessionId: sessionId,
                        playerColor: 'white' 
                    }));

                    game.players[1].send(JSON.stringify({
                        type: 'gameJoined',
                        sessionId: sessionId,
                        playerColor: 'black' 
                    }));
                    console.log(`Player joined game: ${sessionId}`);
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Game not found or full.' }));
                }
                break;
            }

            case 'makeMove': {
                const sessionId = data.sessionId;
                const game = games[sessionId];

                if (game) {
                    game.players.forEach(player => {
                        if (player !== ws && player.readyState === WebSocket.OPEN) {
                            player.send(JSON.stringify({
                                type: 'moveMade',
                                from: data.from,
                                to: data.to,
                                pieceChar: data.pieceChar,
                                isCapture: data.isCapture,
                                newBoard: data.newBoard, 
                                newCurrentPlayer: data.playerColor === 'white' ? 'black' : 'white'
                            }));
                        }
                    });
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
                game.players[0].send(JSON.stringify({ type: 'playerDisconnected' }));
            } else {
                delete games[sessionId];
                console.log(`Game ${sessionId} closed.`);
            }
        }
    });
});
