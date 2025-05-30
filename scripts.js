const userName = "Vighnesh"
const password = "x";
document.querySelector('#user-name').innerHTML = userName;



// const socket = io.connect('https://192.168.1.39:8181/',{
const socket = io.connect('https://localhost:8181/',{
    auth: {
        userName,password
    }
})

const localVideoEl = document.querySelector('#local-video');
const remoteVideoEl = document.querySelector('#remote-video');

let localStream; 
let remoteStream; 
let peerConnection; 
let didIOffer = false;
let mediaRecorder


let peerConfiguration = {
    iceServers:[
        {
            urls:[
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302'
            ]
        }
    ]
}



async function call(){
    console.log("Button Clicked to Call")
    await fetchUserMedia();
    console.log("User Media Fetched")
    await createPeerConnection();

    try{
        console.log("Creating offer...")
        const offer = await peerConnection.createOffer();
        console.log("Offer" + offer);
        peerConnection.setLocalDescription(offer);
        didIOffer = true;
        socket.emit('newOffer',offer);
    }catch(err){
        console.log(err)
    }

}


async function answerOffer(offerObj){
    await fetchUserMedia()
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({}); 
    await peerConnection.setLocalDescription(answer); 
    console.log("offer Object" + offerObj)
    console.log(" Answer" + answer)
   
    offerObj.answer = answer 
 
    const offerIceCandidates = await socket.emitWithAck('newAnswer',offerObj)
    offerIceCandidates.forEach(c=>{
        peerConnection.addIceCandidate(c);
        console.log("======Added Ice Candidate======")
    })
    console.log("Ice Candidates"+ offerIceCandidates)
}


async function addAnswer(offerObj){
    await peerConnection.setRemoteDescription(offerObj.answer)
}


function fetchUserMedia(){
    call = document.getElementById('call')
    cut = document.getElementById('hangup')   
    return new Promise(async(resolve, reject)=>{
        try{
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,    
                audio: true,
            });
            localVideoEl.srcObject = stream;
            localStream = stream;

            resolve();    
        }catch(err){
            console.log(err);
            reject()
        }
    })
}


async function createPeerConnection(offerObj){
    return new Promise(async(resolve, reject)=>{

        peerConnection = await new RTCPeerConnection(peerConfiguration)
        remoteStream = new MediaStream()
        remoteVideoEl.srcObject = remoteStream;


        localStream.getTracks().forEach(track=>{
            peerConnection.addTrack(track,localStream);
        })

        peerConnection.addEventListener("signalingstatechange", (event) => {
            console.log(event);
            console.log(peerConnection.signalingState)
        });

        peerConnection.addEventListener('icecandidate',e=>{
            console.log('........Ice candidate found!......')
            console.log(e)
            if(e.candidate){
                socket.emit('sendIceCandidateToSignalingServer',{
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer,
                })    
            }
        })
        
        peerConnection.addEventListener('track',e=>{
            console.log("Got a track from the other peer!! How excting")
            console.log(e)
            e.streams[0].getTracks().forEach(track=>{
                remoteStream.addTrack(track,remoteStream);
                console.log("Here's an exciting moment... fingers cross")
            })
        })

        if(offerObj){
            await peerConnection.setRemoteDescription(offerObj.offer)
        }
        resolve();
    })
}


function addNewIceCandidate(){
    peerConnection.addIceCandidate(iceCandidate)
    console.log("======Added Ice Candidate======")
}

function sendAudio(){
    console.log("Send Audio called");
    let recorder = null;
    let chunks = []

    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
        alert("Browser does not suppoer getUserMedia");
    }


    navigator.mediaDevices.getUserMedia({audio: true}).then(stream=>{
        recorder = new MediaRecorder(stream);
        
        recorder.start(1000);

        recorder.ondataavailable = async event =>{
            try{
                console.log("Audio chunk",event.data);
                const arrayBuffer = await event.data.arrayBuffer()
                console.log("Array Buffer", arrayBuffer);

                const uint8Array = new Uint8Array(arrayBuffer);
                console.log("Raw Bytes: ",uint8Array)
                console.log("first 20 bytes:", uint8Array.slice(0,20))
                chunks.push(event.data)
                socket.emit('receiveAudio',uint8Array)
            }catch(error){
                console.log("ERROR" + error);
            }
        }
        
        document.querySelector('#hangup').addEventListener('click',()=>{
            recorder.stop()
        })

        recorder.onstop = () =>{
            console.log("Recording stopped");
            const blob = new Blob(chunks,{type: 'audio/webm ; codecs=opus'});
            const audioUrl = URL.createObjectURL(blob)
            console.log(blob)
        }

        
    });



}

document.querySelector('#call').addEventListener('click', () => {
  call();
  sendAudio();
});


// browser embedded in TV (always listen)
// Server for coms
// web Browser application on phone
// one server to listen to the voice commands