let peer = null;
let conn = null;
let myId = null;

const statusText = document.getElementById('status-text');
const myPeerIdEl = document.getElementById('my-peer-id');
const roomIdDisplay = document.getElementById('room-id-display');
const peerIdInput = document.getElementById('peer-id-input');
const connectBtn = document.getElementById('connect-btn');
const chatSection = document.getElementById('chat-section');
const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const rollTestBtn = document.getElementById('roll-test-btn');

// Initialize PeerJS with a custom 4-digit code
function initPeer() {
    // Генерираме случаен 4-цифрен код между 1000 и 9999
    const shortCode = Math.floor(1000 + Math.random() * 9000).toString();

    peer = new Peer(shortCode, {
        host: '0.peerjs.com',
        port: 443,
        secure: true
    });

    peer.on('open', (id) => {
        myId = id;
        myPeerIdEl.textContent = id;
        roomIdDisplay.textContent = id;
        statusText.textContent = 'Waiting for connection...';
        appendLog(`System: Room created with code ${id}`);
    });

    // Ако случайно кодът е зает в момента, опитваме се пак с нов
    peer.on('error', (err) => {
        console.error(err);
        if (err.type === 'unavailable-id') {
            appendLog('System: Code already in use, generating new one...');
            peer.destroy();
            setTimeout(initPeer, 1000); // Опит пак след секунда
        } else {
            appendLog('System Error: ' + err.type);
        }
    });

    // When someone connects to us (Host mode)
    peer.on('connection', (connection) => {
        if (conn) {
            connection.close();
            return;
        }
        conn = connection;
        setupConnection();
        appendLog('System: Peer connected to you!');
    });
}

// Setup connection event listeners
function setupConnection() {
    statusText.textContent = 'Connected!';
    statusText.className = 'connected';
    chatSection.style.display = 'block';

    conn.on('data', (data) => {
        if (data.type === 'chat') {
            appendLog(`Peer: ${data.text}`);
        } else if (data.type === 'dice_roll') {
            appendLog(`🎲 Peer rolled dice: ${data.dice.join(', ')}`);
        }
    });

    conn.on('close', () => {
        statusText.textContent = 'Disconnected';
        statusText.className = 'status';
        appendLog('System: Peer disconnected.');
        conn = null;
    });
}

// Connect to a peer (Join mode)
connectBtn.addEventListener('click', () => {
    const remoteId = peerIdInput.value.trim();
    if (!remoteId || remoteId.length !== 4) {
        alert('Please enter a valid 4-digit Room Code');
        return;
    }

    appendLog(`System: Connecting to room ${remoteId}...`);
    conn = peer.connect(remoteId);

    conn.on('open', () => {
        setupConnection();
        appendLog('System: Successfully connected to host!');
    });

    conn.on('error', (err) => {
        console.error(err);
        appendLog('Connection Error: ' + err);
    });
});

// Send chat message
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !conn) return;

    conn.send({ type: 'chat', text: text });
    appendLog(`You: ${text}`);
    messageInput.value = '';
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Test dice sync
rollTestBtn.addEventListener('click', () => {
    if (!conn) return;
    const dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    conn.send({ type: 'dice_roll', dice: dice });
    appendLog(`You rolled dice: ${dice.join(', ')}`);
});

function appendLog(text) {
    const div = document.createElement('div');
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Initialize on load
initPeer();
