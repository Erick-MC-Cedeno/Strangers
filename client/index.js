import { io } from 'socket.io-client';

// Global State
let peer;
const myVideo = document.getElementById('my-video');
const strangerVideo = document.getElementById('video');
const sendButton = document.getElementById('send');
const inputField = document.querySelector('input');
const chatWrapper = document.querySelector('.chat-holder .wrapper');
const online = document.getElementById('online');
const typingIndicator = document.getElementById('typingIndicator'); // The element for typing status

let remoteSocket;
let type;
let roomid;

// Starts media capture
function start() {
  navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    .then(stream => {
      if (peer) {
        myVideo.srcObject = stream;
        stream.getTracks().forEach(track => peer.addTrack(track, stream));
        peer.ontrack = e => {
          strangerVideo.srcObject = e.streams[0];
          strangerVideo.play();
        };
      }
    })
    .catch(ex => {
      console.log(ex);
    });
}

// Connect to server
const socket = io('http://localhost:8000');

// Disconnect event
socket.on('disconnected', () => {
  location.href = `/?disconnect`;
});

/// --------- WebRTC Related ---------

// Start
socket.emit('start', (person) => {
  type = person;
});

// Get remote socket and room id
socket.on('remote-socket', (id) => {
  remoteSocket = id;
  // Hide the spinner
  document.querySelector('.modal').style.display = 'none';
  
  // Create a peer connection
  peer = new RTCPeerConnection();

  // On negotiation needed
  peer.onnegotiationneeded = async () => {
    webrtc();
  };

  // Send ICE candidates to remote socket
  peer.onicecandidate = (e) => {
    socket.emit('ice:send', { candidate: e.candidate, to: remoteSocket });
  };

  // Start media capture
  start();
});

// Get room ID from server
socket.on('roomid', (id) => {
  roomid = id;
  console.log("Room ID set:", roomid);
});

// Creates offer if 'type' = p1
async function webrtc() {
  if (type === 'p1') {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('sdp:send', { sdp: peer.localDescription });
  }
}

// Receive SDP sent by remote socket
socket.on('sdp:reply', async ({ sdp }) => {
  await peer.setRemoteDescription(new RTCSessionDescription(sdp));
  if (type === 'p2') {
    const ans = await peer.createAnswer();
    await peer.setLocalDescription(ans);
    socket.emit('sdp:send', { sdp: peer.localDescription });
  }
});

// Receive ICE candidate from remote socket
socket.on('ice:reply', async ({ candidate }) => {
  await peer.addIceCandidate(candidate);
});

/// ----------- Handle Messages Logic -----------

// Function to send messages
const sendMessage = () => {
  const input = inputField.value.trim();
  if (input) {
    socket.emit('send-message', input, type, roomid);
    // Add message to local chat box
    const msghtml = `
      <div class="msg">
        <b>You: </b> <span>${input}</span>
      </div>
    `;
    chatWrapper.innerHTML += msghtml;
    chatWrapper.scrollTop = chatWrapper.scrollHeight;
    inputField.value = '';
    // Notify server that user has stopped typing
    socket.emit('typing', { roomid, isTyping: false });
  }
};

// Handle send button click
sendButton.addEventListener('click', (e) => {
  e.preventDefault();
  sendMessage();
});

// Handle "Enter" key press
inputField.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendMessage();
  }
});

// Emit typing status when user is typing
inputField.addEventListener('input', () => {
  // Check if the input is not empty; if so, emit isTyping:true, else false.
  const isTyping = inputField.value.length > 0;
  console.log("Typing status:", isTyping);
  socket.emit('typing', { roomid, isTyping });
});

// Listen for typing events from server (from remote user)
socket.on('typing', (isTyping) => {
  console.log('Received typing event:', isTyping);
  if (typingIndicator) {
    typingIndicator.style.display = isTyping ? 'block' : 'none';
    typingIndicator.textContent = isTyping ? 'Stranger is typing...' : '';
  }
});

// On receive message
socket.on('get-message', (input) => {
  const msghtml = `
    <div class="msg">
      <b>Stranger: </b> <span>${input}</span>
    </div>
  `;
  chatWrapper.innerHTML += msghtml;
  chatWrapper.scrollTop = chatWrapper.scrollHeight;
});