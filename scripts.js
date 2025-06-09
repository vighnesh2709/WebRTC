const userName = "Vighnesh"
const password = "x";
document.querySelector('#user-name').innerHTML = userName;



const socket = io.connect('https://10.1.156.142:8181/', {
// const socket = io.connect('https://localhost:8181/', {
    auth: {
        userName, password
    }
})

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
        peerConnection.setLocalDescription(offer);
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
    await peerConnection.setRemoteDescription(offerObj.answer)
}


function fetchUserMedia() {
    call = document.getElementById('call')
    cut = document.getElementById('hangup')
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

        peerConnection = await new RTCPeerConnection(peerConfiguration)
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
            await peerConnection.setRemoteDescription(offerObj.offer)
        }
        resolve();
    })
}


function addNewIceCandidate() {
    peerConnection.addIceCandidate(iceCandidate)
    console.log("======Added Ice Candidate======")
}

function sendAudio() {
    console.log("Send Audio called");
    let recorder = null;
    let chunks = []

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Browser does not suppoer getUserMedia");
    }


    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        recorder = new MediaRecorder(stream);

        recorder.start(1000);

        recorder.ondataavailable = async event => {
            try {
                console.log("Audio chunk", event.data);
                const arrayBuffer = await event.data.arrayBuffer()
                console.log("Array Buffer", arrayBuffer);

                const floatArray = new Float32Array(arrayBuffer);
                console.log("Raw Bytes: ", uint8Array)
                console.log("first 20 bytes:", floatArray.slice(0, 20))
                chunks.push(event.data)
                // socket.emit('receiveAudio',uint8Array)
                websocket.send(floatArray)
            } catch (error) {
                console.log("ERROR" + error);
            }
        }

        document.querySelector('#hangup').addEventListener('click', () => {
            recorder.stop()
        })

        recorder.onstop = () => {
            console.log("Recording stopped");
            const blob = new Blob(chunks, { type: 'audio/webm ; codecs=opus' });
            const audioUrl = URL.createObjectURL(blob)
            console.log(blob)
        }


    });



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


// async function sendBufferedAudio() {
//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     const audioContext = new AudioContext();
//     const source = audioContext.createMediaStreamSource(stream);

//     const processor = audioContext.createScriptProcessor(4096, 1, 1);

//     const sampleRate = audioContext.sampleRate; // Usually 44100
//     const bufferDuration = 10; // seconds
//     const bufferSize = sampleRate * bufferDuration;

//     let buffer = new Float32Array(bufferSize);
//     let offset = 0;

//     processor.onaudioprocess = (event) => {
//         const inputBuffer = event.inputBuffer.getChannelData(0);
//         const len = inputBuffer.length;

//         // If adding the new data exceeds our buffer, ignore the extra
//         if (offset + len <= bufferSize) {
//             buffer.set(inputBuffer, offset);
//             offset += len;
//         }

//         // Once we have 10 seconds worth of data, send and reset
//         if (offset >= bufferSize) {
//             websocket.send(buffer.buffer); // Send full 10-second buffer
//             console.log("Sent 10-second audio chunk");
//             offset = 0; // Reset buffer offset
//         }
//     };

//     source.connect(processor);
//     processor.connect(audioContext.destination);
// }


document.querySelector('#call').addEventListener('click', () => {
    call();
    //   sendAudio();
    sendRawAudio();
});


// browser embedded in TV (always listen)
// Server for coms
// web Browser application on phone
// one server to listen to the voice commands