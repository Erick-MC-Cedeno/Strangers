import { io } from 'socket.io-client';

// Elementos del DOM
const myVideo = document.getElementById('my-video');
const strangerVideo = document.getElementById('video');
const sendButton = document.getElementById('send');
const inputField = document.querySelector('input');
const chatWrapper = document.querySelector('.chat-holder .wrapper');
const typingIndicator = document.getElementById('typingIndicator');
const nextBtn = document.getElementById('nextBtn');
const exitBtn = document.getElementById('exitBtn');
const spinner = document.querySelector('.modal');

// Estado global
let peer = null;
let localStream = null;
let remoteSocket = null;
let type = null;
let roomid = null;
let socket = null;

// Función de inicialización principal
async function init() {
  socket = io('http://localhost:8000');
  setupSocketEvents();
  await initMedia();
  setupUIEvents();
}

// Función de limpieza completa
function fullCleanup() {
  if (peer) {
    peer.close();
    peer = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  myVideo.srcObject = null;
  strangerVideo.srcObject = null;

  spinner.style.display = 'flex';
  chatWrapper.innerHTML = '';
}

// Inicializar medios
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    myVideo.srcObject = localStream;
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert('Could not access your camera/microphone. Please refresh and allow permissions.');
  }
}

// Configurar WebRTC
function setupPeerConnection() {
  peer = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  peer.onicecandidate = (e) => {
    if (e.candidate && remoteSocket) {
      socket.emit('ice:send', { candidate: e.candidate, to: remoteSocket });
    }
  };

  peer.ontrack = (e) => {
    strangerVideo.srcObject = e.streams[0];
    strangerVideo.play().catch(e => console.error('Error playing video:', e));
  };

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });
  }
}

// Reiniciar conexión al hacer clic en "Next"
function restartConnection() {
  remoteSocket = null;
  roomid = null;
  type = null;

  socket.emit('disconnect-me');

  setTimeout(() => {
    spinner.style.display = 'flex';
    socket.emit('start', (newType) => {
      type = newType;
    });
  }, 300);
}

// Configurar eventos del socket
function setupSocketEvents() {
  socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('start', (personType) => {
      type = personType;
    });
  });

  socket.on('start', (personType) => {
    type = personType;
  });

  socket.on('remote-socket', (partnerId) => {
    remoteSocket = partnerId;
    spinner.style.display = 'none';
    setupPeerConnection();

    if (type === 'p1') {
      createOffer();
    }
  });

  socket.on('roomid', (id) => {
    roomid = id;
    console.log('Room ID:', roomid);
  });

  socket.on('disconnected', () => {
    fullCleanup();
    alert('Partner disconnected. Searching for new connection...');
    restartConnection();
  });

  socket.on('disconnect-confirm', () => {
    fullCleanup();
  });

  // WebRTC
  socket.on('sdp:reply', async ({ sdp }) => {
    if (!peer) return;

    try {
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      if (type === 'p2') {
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('sdp:send', { sdp: peer.localDescription });
      }
    } catch (error) {
      console.error('SDP handling failed:', error);
    }
  });

  socket.on('ice:reply', async ({ candidate }) => {
    if (!peer) return;

    try {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('ICE candidate error:', error);
    }
  });

  // Chat
  socket.on('typing', (isTyping) => {
    typingIndicator.style.display = isTyping ? 'block' : 'none';
  });

  socket.on('get-message', (message) => {
    const sanitizedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    chatWrapper.innerHTML += `
      <div class="msg">
        <b>Stranger: </b> <span>${sanitizedMessage}</span>
      </div>
    `;
    chatWrapper.scrollTop = chatWrapper.scrollHeight;
  });
}

// Configurar eventos de UI
function setupUIEvents() {
  exitBtn.addEventListener('click', () => {
    fullCleanup();
    socket.emit('disconnect-me');
    window.location.href = '/';
  });

  nextBtn.addEventListener('click', () => {
    fullCleanup();
    restartConnection();
  });

  const sendMessage = () => {
    const message = inputField.value.trim();
    if (message && roomid) {
      const sanitizedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      socket.emit('send-message', sanitizedMessage, type, roomid);

      chatWrapper.innerHTML += `
        <div class="msg">
          <b>You: </b> <span>${sanitizedMessage}</span>
        </div>
      `;
      inputField.value = '';
      chatWrapper.scrollTop = chatWrapper.scrollHeight;

      socket.emit('typing', { roomid, isTyping: false });
    }
  };

  sendButton.addEventListener('click', (e) => {
    e.preventDefault();
    sendMessage();
  });

  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  let typingTimeout;
  inputField.addEventListener('input', () => {
    if (!roomid) return;

    const isTyping = inputField.value.length > 0;
    socket.emit('typing', { roomid, isTyping });

    clearTimeout(typingTimeout);
    if (isTyping) {
      typingTimeout = setTimeout(() => {
        socket.emit('typing', { roomid, isTyping: false });
      }, 2000);
    }
  });
}

// Crear oferta WebRTC
async function createOffer() {
  if (!peer) return;

  try {
    const offer = await peer.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await peer.setLocalDescription(offer);
    socket.emit('sdp:send', { sdp: peer.localDescription });
  } catch (error) {
    console.error('Offer creation failed:', error);
  }
}

// Inicializar la aplicación
init();
