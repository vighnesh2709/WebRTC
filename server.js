const fs = require('fs');
const https = require('https');
const express = require('express');
const app = express();
const socketio = require('socket.io');
const { blob } = require('stream/consumers');
app.use(express.static(__dirname));

const key = fs.readFileSync('cert.key');
const cert = fs.readFileSync('cert.crt');

const expressServer = https.createServer({ key, cert }, app);

const io = socketio(expressServer, {
    cors: {
        origin: [
            "https://localhost",
            "https://192.168.1.39",
            "https://10.1.156.142",
            "https://10.1.26.236",
            "https://10.1.156.142"
        ],
        methods: ["GET", "POST"]
    }
});
expressServer.listen(8181, () => {
    console.log("HTTPS server listening on port 8181");
});

const offers = [];
const connectedSockets = [];

io.on('connection', (socket) => {
    console.log(` New connection: socket.id = ${socket.id}`);

    const userName = socket.handshake.auth.userName;
    const password = socket.handshake.auth.password;

    console.log(`👤 Auth attempt by '${userName}'`);

    if (password !== "x") {
        console.log(`Incorrect password for '${userName}', disconnecting`);
        socket.disconnect(true);
        return;
    }

    connectedSockets.push({
        socketId: socket.id,
        userName
    });
    console.log(`✅ '${userName}' authenticated and added to connectedSockets`);

    if (offers.length) {
        socket.emit('availableOffers', offers);
        console.log(`Sent ${offers.length} available offers to '${userName}'`);
    }

    socket.on('newOffer', newOffer => {
        offers.push({
            offererUserName: userName,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answererIceCandidates: []
        });
        console.log(`New offer created by '${userName}'`);
        socket.broadcast.emit('newOfferAwaiting', offers.slice(-1));
        console.log("Broadcasted new offer to others");
    });

    socket.on('newAnswer', (offerObj, ackFunction) => {
        console.log(`Answer received from '${userName}' for '${offerObj.offererUserName}'`);

        const socketToAnswer = connectedSockets.find(s => s.userName === offerObj.offererUserName);
        if (!socketToAnswer) {
            console.log("No matching socket found for offerer");
            return;
        }

        const socketIdToAnswer = socketToAnswer.socketId;
        const offerToUpdate = offers.find(o => o.offererUserName === offerObj.offererUserName);
        if (!offerToUpdate) {
            console.log(" No matching offer found to update");
            return;
        }

        ackFunction(offerToUpdate.offerIceCandidates);
        offerToUpdate.answer = offerObj.answer;
        offerToUpdate.answererUserName = userName;

        console.log(`Sending answer back to '${offerObj.offererUserName}'`);
        socket.to(socketIdToAnswer).emit('answerResponse', offerToUpdate);
    });

    socket.on('sendIceCandidateToSignalingServer', iceCandidateObj => {
        const { didIOffer, iceUserName } = iceCandidateObj;

        console.log(`ICE candidate received from '${iceUserName}' (didIOffer: ${didIOffer})`);

        if (didIOffer) {
            const offerInOffers = offers.find(o => o.offererUserName === iceUserName);
            if (offerInOffers) {
                offerInOffers.offerIceCandidates.push(iceCandidateObj.iceCandidate);
                if (offerInOffers.answererUserName) {
                    const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.answererUserName);
                    if (socketToSendTo) {
                        socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidateObj.iceCandidate);
                        console.log(`Forwarded ICE to answerer '${offerInOffers.answererUserName}'`);
                    } else {
                        console.log(" ICE received but answerer socket not found");
                    }
                }
            } else {
                console.log("No offer found for ICE (as offerer)");
            }
        } else {
            const offerInOffers = offers.find(o => o.answererUserName === iceUserName);
            if (offerInOffers) {
                // Buffer the answerer's ICE candidate
                offerInOffers.answererIceCandidates.push(iceCandidateObj.iceCandidate);
                const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.offererUserName);
                if (socketToSendTo) {
                    socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidateObj.iceCandidate);
                    console.log(`Forwarded ICE to offerer '${offerInOffers.offererUserName}'`);
                } else {
                    console.log(" ICE received but offerer socket not found");
                }
            } else {
                console.log("No offer found for ICE (as answerer)");
            }
        }
    });

    socket.on('disconnect',()=>{
        console.log("disconnected ${socket.id}")
        const index = connectedSockets.findIndex(s=>s.socketId === socket.id)
        if(index !== -1) connectedSockets.splice(index,1);

    })

});
