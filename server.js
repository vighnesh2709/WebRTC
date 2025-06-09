
const fs = require('fs');
const https = require('https')
const express = require('express');
const app = express();
const socketio = require('socket.io');
app.use(express.static(__dirname))


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
expressServer.listen(8181);


const offers = [
    // offererUserName
    // offer
    // offerIceCandidates
    // answererUserName
    // answer
    // answererIceCandidates
];
const connectedSockets = [
    //username, socketId
]

io.on('connection', (socket) => {
    console.log("Someone has connected", socket.id);
    const userName = socket.handshake.auth.userName;
    const password = socket.handshake.auth.password;

    if (password !== "x") {
        socket.disconnect(true);
        return;
    }
    connectedSockets.push({
        socketId: socket.id,
        userName
    })

    if (offers.length) {
        socket.emit('availableOffers', offers);
    }

    socket.on('newOffer', newOffer => {
        offers.push({
            offererUserName: userName,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answererIceCandidates: []
        })
        // console.log(newOffer.sdp.slice(50))
        console.log("new Offer Sent")
        socket.broadcast.emit('newOfferAwaiting', offers.slice(-1))
    })

    socket.on('newAnswer', (offerObj, ackFunction) => {
        // console.log(offerObj);
        console.log("answer offer")
        const socketToAnswer = connectedSockets.find(s => s.userName === offerObj.offererUserName)
        if (!socketToAnswer) {
            console.log("No matching socket")
            return;
        }
        const socketIdToAnswer = socketToAnswer.socketId;
        const offerToUpdate = offers.find(o => o.offererUserName === offerObj.offererUserName)
        if (!offerToUpdate) {
            console.log("No OfferToUpdate")
            return;
        }
        ackFunction(offerToUpdate.offerIceCandidates);
        offerToUpdate.answer = offerObj.answer
        offerToUpdate.answererUserName = userName
        socket.to(socketIdToAnswer).emit('answerResponse', offerToUpdate)
    })

    socket.on('sendIceCandidateToSignalingServer', iceCandidateObj => {
        const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
        // console.log(iceCandidate);
        console.log("ICE candidates")
        if (didIOffer) {
            const offerInOffers = offers.find(o => o.offererUserName === iceUserName);
            if (offerInOffers) {
                offerInOffers.offerIceCandidates.push(iceCandidate)
                if (offerInOffers.answererUserName) {
                    const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.answererUserName);
                    if (socketToSendTo) {
                        socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate)
                    } else {
                        console.log("Ice candidate recieved but could not find answere")
                    }
                }
            }
        } else {
            const offerInOffers = offers.find(o => o.answererUserName === iceUserName);
            const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.offererUserName);
            if (socketToSendTo) {
                socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate)
            } else {
                console.log("Ice candidate recieved but could not find offerer")
            }
        }
        // console.log(offers)
    })
 


})