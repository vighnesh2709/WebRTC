const fs = require('fs');
const https = require('https');
const express = require('express');
const app = express();
const socketio = require('socket.io');
const { blob, buffer } = require('stream/consumers');
require('dotenv').config();
const { SarvamAIClient } = require("sarvamai");
const Ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { Writable } = require('stream');
const { type } = require('os');
const { exec } = require('child_process');
const { error } = require('console');
const { configDotenv } = require('dotenv');


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
let targetLanguage1 = null;
let targetLanguage2 = null;

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

    socket.on('disconnect', () => {
        console.log(` Disconnected: socket.id = ${socket.id}`)
        const index = connectedSockets.findIndex(s => s.socketId === socket.id)
        if (index !== -1) connectedSockets.splice(index, 1);

    })

    // socket.on("Audio1",(audio)=>{
    //      console.log("Received audio message")
    //      console.log(audio)
    //      socket.broadcast.emit("Listener1",audio)
    // })
    // let fileCount = 0

    const rawFile = "/home/vighnesh/Desktop/NITT/WebRTC/test.raw";
    const mp3File = "/home/vighnesh/Desktop/NITT/WebRTC/output.mp3";
    const rawFile2 = "/home/vighnesh/Desktop/NITT/WebRTC/test2.raw";
    const mp3File2 = "/home/vighnesh/Desktop/NITT/WebRTC/output2.mp3";
    const API_KEY = process.env.SARVAM_API_KEY;
    const client = new SarvamAIClient({ apiSubscriptionKey: API_KEY });

    const languageMap = {
        "bn": "bn-IN",
        "en": "en-IN",
        "gu": "gu-IN",
        "hi": "hi-IN",
        "kn": "kn-IN",
        "ml": "ml-IN",
        "mr": "mr-IN",
        "od": "od-IN",
        "pa": "pa-IN",
        "ta": "ta-IN",
        "te": "te-IN",
        "NA": "NA"
    };

    let isProcessing1 = false; // Separate flag for Audio1
    let isProcessing2 = false; // Separate flag for Audio2


    socket.on("sendLanguage", (data) => {
        targetLanguage1 = languageMap[data]
    })

    socket.on("sendLanguage1", (data) => {
        targetLanguage2 = languageMap[data]
    })

    socket.on("Audio1", async (data) => {
        if (isProcessing1) return;
        fs.appendFileSync(rawFile, data);
        const stats = fs.statSync(rawFile);
        // console.log(`RAW file size: ${stats.size} bytes`);
        console.log("2", targetLanguage2)

        if (stats.size >= 512000) {

            if (targetLanguage2 !== "NA") {
                isProcessing1 = true;

                const cmd = `ffmpeg -f s16le -ar 44100 -ac 1 -i "${rawFile}" "${mp3File}"`;

                try {
                    await new Promise((resolve, reject) => {
                        exec(cmd, (error, stdout, stderr) => {
                            if (error) return reject(error);
                            if (stderr) console.warn(stderr);
                            // console.log("✅ MP3 created");
                            resolve();
                        });
                    });

                    // Transcribe
                    const buffer = fs.readFileSync(mp3File);
                    const file = new File([buffer], "chunk.mp3", { type: "audio/mpeg" });
                    const response = await client.speechToText.transcribe(file, {
                        model: "saarika:v2",
                    });
                    // console.log("ORIGINAL AUDIO TO TEXT")
                    // console.log(response)


                    const response1 = await client.text.translate({
                        input: response.transcript,
                        source_language_code: "auto",
                        target_language_code: targetLanguage2,
                        speaker_gender: "Male"
                    });

                    // console.log("TEXT TO TEXT TRANSLATION 1", targetLanguage2)
                    // console.log(response1)

                    const response2 = await client.textToSpeech.convert({
                        text: response1.translated_text,
                        model: "bulbul:v2",
                        speaker: "anushka",
                        target_language_code: targetLanguage2
                    });
                    // console.log("TEXT TO SPEECH DONE")

                    socket.broadcast.emit("listener2", response2)

                } catch (err) {
                    console.error("Error during FFmpeg or Sarvam:", err);
                } finally {
                    // 🔄 Clean up for next chunk
                    try {
                        fs.unlinkSync(rawFile);
                        fs.unlinkSync(mp3File);
                        // console.log("Files reset for next chunk");
                    } catch (cleanupErr) {
                        // console.warn("Cleanup error:", cleanupErr.message);
                    }
                    isProcessing1 = false;
                }
            }
        }
    });

    socket.on("Audio2", async (data) => {
        if (isProcessing2) return;

        fs.appendFileSync(rawFile2, data);
        const stats = fs.statSync(rawFile2);
        // console.log(`RAW file size: ${stats.size} bytes`);
        console.log("1", targetLanguage1)
        if (stats.size >= 512000) {
            if (targetLanguage1 !== "NA") {


                isProcessing2 = true;

                const cmd = `ffmpeg -f s16le -ar 44100 -ac 1 -i "${rawFile2}" "${mp3File2}"`;

                try {
                    await new Promise((resolve, reject) => {
                        exec(cmd, (error, stdout, stderr) => {
                            if (error) return reject(error);
                            if (stderr) console.warn(stderr);
                            // console.log("✅ MP3 created");
                            resolve();
                        });
                    });

                    // Transcribe
                    const buffer = fs.readFileSync(mp3File2);
                    const file = new File([buffer], "chunk.mp3", { type: "audio/mpeg" });
                    const response = await client.speechToText.transcribe(file, {
                        model: "saarika:v2",
                    });
                    // console.log("ORIGINAL SPEECH TO TEXT")
                    // console.log(response.transcript)
                    const response1 = await client.text.translate({
                        input: response.transcript,
                        source_language_code: "auto",
                        target_language_code: targetLanguage1,
                        speaker_gender: "Male"
                    });
                    // console.log("TEXT TO TEXT Translation 2", targetLanguage1)
                    // console.log(response1.translated_text)

                    const response2 = await client.textToSpeech.convert({
                        text: response1.translated_text,
                        model: "bulbul:v2",
                        speaker: "anushka",
                        target_language_code: targetLanguage1
                    });
                    // console.log("TEXT TO SPEECH DONE")
                    socket.broadcast.emit("listener1", response2)

                } catch (err) {
                    console.error(" Error during FFmpeg or Sarvam:", err);
                } finally {
                    // 🔄 Clean up for next chunk
                    try {
                        fs.unlinkSync(rawFile2);
                        fs.unlinkSync(mp3File2);
                        // console.log("Files reset for next chunk");
                    } catch (cleanupErr) {
                        console.warn("Cleanup error:", cleanupErr.message);
                    }
                    isProcessing2 = false;
                }
            }
        }
    });



});


