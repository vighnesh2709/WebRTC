let userName
const password = "x";

const socket = io('https://10.1.156.142:8181/', {
    autoConnect: false  
});

document.getElementById('join-btn').onclick = () => {
    const input = document.getElementById('username-input');
    userName = input.value.trim();

    if (!userName) {
        alert("Please enter a valid name");
        return;
    }

    document.getElementById('user-name').innerText = `You: ${userName}`;
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



let audioBuffer = []; // temporary storage
let sampleRate = 44100; // default, will be overwritten
const MAX_CHUNK_SIZE_BYTES = 1024 * 1024; // 1MB
const BYTES_PER_SAMPLE = 4; // Float32 = 4 bytes

async function sendRawAudio() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    sampleRate = audioContext.sampleRate;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    const maxSamples = Math.floor(MAX_CHUNK_SIZE_BYTES / BYTES_PER_SAMPLE); // ≈ 262144

    processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer.getChannelData(0); // mono

        // Correctly clone the buffer
        const floatData = new Float32Array(inputBuffer.length);
        floatData.set(inputBuffer);

        // Append to our audio buffer
        audioBuffer.push(...floatData);

        // If we collected enough samples, send it
        if (audioBuffer.length >= maxSamples) {
            const chunkToSend = audioBuffer.slice(0, maxSamples);
            audioBuffer = audioBuffer.slice(maxSamples); // remove sent portion

            websocket.send(new Float32Array(chunkToSend).buffer);



            console.log(`Sent audio chunk: ${chunkToSend.length} samples (${(chunkToSend.length / sampleRate).toFixed(2)} seconds)`);
            console.log("Next samples in buffer:", audioBuffer.slice(0, 20));
        }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
}


document.querySelector('#call').addEventListener('click', () => {
    call();
    sendRawAudio();
});