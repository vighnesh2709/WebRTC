let userName
const password = "x";
let languageSelect
const socket = io('https://10.1.156.142:8181/', {
    autoConnect: false
});

document.getElementById('join-btn').onclick = () => {
    const input = document.getElementById('username-input');
    languageSelect = document.getElementById('language-select');

    userName = input.value.trim();
    const language = languageSelect.value;

    if (!userName) {
        alert("Please enter a valid name");
        return;
    }

    if (!language) {
        alert("Please select a language");
        return;
    }

    document.getElementById('user-name').innerText = `You: ${userName}`;
    console.log(language)
    socket.auth = { userName, password };
    socket.connect();
}
const localVideoEl = document.querySelector('#local-video');
const remoteVideoEl = document.querySelector('#remote-video');

let localStream;
let remoteStream;
let peerConnection;
let didIOffer = false;
let mediaRecorder
let isOpen = false
let websocket
let sender
let receiver
let languageFlag = false

let peerConfiguration = {
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
            ]
        }
    ]
}

async function call() {
    sender = true
    socket.emit("sendLanguage", languageSelect.value)


    console.log("Button Clicked to Call")
    await fetchUserMedia();
    console.log("User Media Fetched")
    await createPeerConnection();

    websocket = new WebSocket("ws://localhost:8001/");

    websocket.addEventListener("open", () => {
        isOpen = true;
        console.log("Web socket is open to exchange data")
    })

    try {
        console.log("Creating offer...")
        const offer = await peerConnection.createOffer();
        console.log("Offer" + offer);
        await peerConnection.setLocalDescription(offer);
        didIOffer = true;
        socket.emit('newOffer', offer);
    } catch (err) {
        console.log(err)
    }
}

async function answerOffer(offerObj) {
    receiver = true
    console.log("SEND LANGUAGE",languageSelect.value)
    socket.emit("sendLanguage1", languageSelect.value)
    websocket = new WebSocket("ws://localhost:8002/")
    websocket.addEventListener("open", () => {
        isOpen = true;
        console.log("Web socket is open to exchange data")
    })

    await fetchUserMedia()
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({});
    await peerConnection.setLocalDescription(answer);
    console.log("offer Object" + offerObj)
    console.log(" Answer" + answer)

    offerObj.answer = answer

    const offerIceCandidates = await socket.emitWithAck('newAnswer', offerObj)
    offerIceCandidates.forEach(c => {
        peerConnection.addIceCandidate(c);
        console.log("======Added Ice Candidate======")
    })
    console.log("Ice Candidates" + offerIceCandidates)
}

async function addAnswer(offerObj) {
    await peerConnection.setRemoteDescription(offerObj.answer);

    for (const candidate of pendingCandidates) {
        try {
            await peerConnection.addIceCandidate(candidate);
            console.log("Added buffered ICE candidate after setRemoteDescription");
        } catch (err) {
            console.warn("Error adding buffered ICE candidate:", err);
        }
    }
    pendingCandidates = [];
}

function fetchUserMedia() {
    return new Promise(async (resolve, reject) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            localVideoEl.srcObject = stream;
            localStream = stream;

            resolve();
        } catch (err) {
            console.log(err);
            reject()
        }
    })
}

async function createPeerConnection(offerObj) {
    return new Promise(async (resolve, reject) => {

        peerConnection = new RTCPeerConnection(peerConfiguration)
        remoteStream = new MediaStream()
        remoteVideoEl.srcObject = remoteStream;

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        })

        peerConnection.addEventListener("signalingstatechange", (event) => {
            console.log(event);
            console.log(peerConnection.signalingState)
        });

        peerConnection.addEventListener('icecandidate', e => {
            console.log('........Ice candidate found!......')
            console.log(e)
            if (e.candidate) {
                socket.emit('sendIceCandidateToSignalingServer', {
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer,
                })
            }
        })

        peerConnection.addEventListener('track', e => {
            console.log("Got a track from the other peer!! How excting")
            console.log(e)
            e.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track, remoteStream);
                console.log("Here's an exciting moment... fingers cross")
            })
        })

        if (offerObj) {
            await peerConnection.setRemoteDescription(offerObj.offer);

            for (const candidate of pendingCandidates) {
                try {
                    await peerConnection.addIceCandidate(candidate);
                    console.log("Added buffered ICE candidate after setRemoteDescription");
                } catch (err) {
                    console.warn("Error adding buffered ICE candidate:", err);
                }
            }
            pendingCandidates = [];
        }
        resolve();
    })
}

let pendingCandidates = [];

async function addNewIceCandidate() {
    if (peerConfiguration && peerConfiguration.setRemoteDescription && peerConnection.setRemoteDescription.type) {
        try {
            await peerConnection.addIceCandidate(iceCandidate)
            console.log("Added ICE Candidates Immediately");
        } catch (err) {
            console.warm("error adding ICE Candidate", err)
        }
    } else {
        console.log("Remote Description not set yet, buffering ice Candidates")
        pendingCandidates.push(iceCandidate)
    }
    console.log("======Added Ice Candidate======")
}

async function sendRawAudio() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("Mic stream obtained");

    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    const source = audioContext.createMediaStreamSource(stream);

    const processor = audioContext.createScriptProcessor(4096, 1, 1);  // buffer size, input channels, output channels

    processor.onaudioprocess = (event) => {
        const float32Data = event.inputBuffer.getChannelData(0); // mono channel
        const int16Data = new Int16Array(float32Data.length);

        for (let i = 0; i < float32Data.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Data[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Emit the raw PCM as binary
        if (sender) {

            socket.emit("Audio1", int16Data.buffer, { binary: true });

        }
        if (receiver) {

            socket.emit("Audio2", int16Data.buffer, { binary: true });

        }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);  // Keep alive

    console.log("Streaming raw PCM audio...");
}

// Fixed audio event handlers
socket.on("listener1", (audioData) => {
    console.log("Received audio on listener1");
    playTranslatedAudio(audioData);
});

socket.on("listener2", (audioData) => {
    console.log("Received audio on listener2");
    playTranslatedAudio(audioData);
});



function playTranslatedAudio(response) {
    try {
        console.log("Playing translated audio response");

        // The response from SarvamAI TTS should contain the audio data
        // Check if it has the expected structure
        if (response && response.audios && response.audios[0]) {
            // Assuming the audio is base64 encoded
            const audioSrc = `data:audio/wav;base64,${response.audios[0]}`;
            const audioElement = new Audio(audioSrc);

            audioElement.play()
                .then(() => {
                    console.log("Translated audio playback started");
                })
                .catch((err) => {
                    console.error("Audio playback failed:", err);
                });
        } else {
            console.error("Unexpected audio response format:", response);
        }

    } catch (error) {
        console.error("Error processing translated audio:", error);
    }
}

document.querySelector('#call').addEventListener('click', () => {
    call();
    sendRawAudio();
});