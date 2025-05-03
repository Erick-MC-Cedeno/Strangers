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

// Inicializar la aplicación
async function init() {
  socket = io('https://zany-potato-x795wpw9x4gf6gg5-8000.app.github.dev/');
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

// Inicializar cámara/micrófono
async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    myVideo.srcObject = localStream;
  } catch (err) {
    console.error('Error accessing media devices:', err);
    alert('No se pudo acceder a tu cámara/micrófono.');
  }
}

// Configurar la conexión WebRTC
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
    strangerVideo.play().catch(e => console.error('Error al reproducir video:', e));
  };

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peer.addTrack(track, localStream);
    });
  }
}

// Reiniciar conexión
function restartConnection() {
  remoteSocket = null;
  roomid = null;
  type = null;

  socket.emit('disconnect-me');

  setTimeout(() => {
    spinner.style.display = 'flex';
    // Reiniciar la cámara antes de buscar una nueva sala
    initMedia().then(() => {
      socket.emit('start', (newType) => {
        type = newType;
      });
    }).catch(err => {
      console.error('Error reiniciando la cámara:', err);
      // Intentar conectar de todos modos
      socket.emit('start', (newType) => {
        type = newType;
      });
    });
  }, 300);
}

// Configuración de eventos del socket
function setupSocketEvents() {
  socket.on('connect', () => {
    console.log('Conectado al servidor');
    socket.emit('start', (personType) => {
      type = personType;
    });
  });

  socket.on('start', (personType) => {
    type = personType;
  });

  socket.on('roomid', (id) => {
    roomid = id;
    console.log('Room ID:', roomid);
  });

  socket.on('remote-socket', (partnerId) => {
    remoteSocket = partnerId;
    spinner.style.display = 'none';
    
    // Asegurar que la cámara esté activa antes de configurar la conexión
    if (!localStream) {
      initMedia().then(() => {
        setupPeerConnection();
        if (type === 'p1') {
          createOffer();
        }
      });
    } else {
      setupPeerConnection();
      if (type === 'p1') {
        createOffer();
      }
    }
  });

  socket.on('disconnected', () => {
    // Reemplazar el alert con una notificación no bloqueante
    showNotification('Tu pareja se desconectó. Buscando una nueva...');
    fullCleanup();
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
    } catch (err) {
      console.error('Error procesando SDP:', err);
    }
  });

  socket.on('ice:reply', async ({ candidate }) => {
    if (!peer) return;

    try {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error agregando ICE:', err);
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

  // Verificar estado de la sala
  socket.on('check-room-status', (status) => {
    if (status === 'not_ready') {
      alert('Debe haber dos personas en la sala para proceder.');
    }
  });
}

// Eventos de interfaz
function setupUIEvents() {
  exitBtn.addEventListener('click', () => {
    fullCleanup();
    socket.emit('disconnect-me');
    window.location.href = '/';
  });

  nextBtn.addEventListener('click', () => {
    // Cambiar directamente sin verificar el estado de la sala
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

// Crear oferta
async function createOffer() {
  if (!peer) return;

  try {
    const offer = await peer.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await peer.setLocalDescription(offer);
    socket.emit('sdp:send', { sdp: peer.localDescription });
  } catch (err) {
    console.error('Error creando la oferta:', err);
  }
}

// Función para mostrar notificaciones no bloqueantes
function showNotification(message) {
  // Crear elemento de notificación
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  notification.style.color = 'white';
  notification.style.padding = '10px 20px';
  notification.style.borderRadius = '5px';
  notification.style.zIndex = '9999';
  
  // Añadir al DOM
  document.body.appendChild(notification);
  
  // Eliminar después de 3 segundos
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 500);
  }, 3000);
}

init();