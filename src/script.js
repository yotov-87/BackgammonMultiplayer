let peer = null;
let conn = null;
let myId = null;
let connectTimeout = null;

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
const connTypeEl = document.getElementById('conn-type');

// ---------------------------------------------------------------------------
// ICE сървъри (STUN + TURN)
// ---------------------------------------------------------------------------
// STUN само "открива" публичния ти адрес. Когато единият е на мобилна мрежа
// (CGNAT / симетричен NAT), директна връзка често е невъзможна и е нужен TURN,
// който препраща трафика.
//
// ВАЖНО: за надеждна работа си направи безплатен акаунт на https://www.metered.ca
// (Open Relay / TURN) или https://www.expressturn.com, и сложи твоите
// username/credential тук. Публичните "openrelayproject" данни по-долу са само
// резерва и може да не работят/да са ограничени.
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },

    // ---- ТВОЯТ TURN (замени!) ----
    // {
    //     urls: [
    //         'turn:YOUR_TURN_HOST:80',
    //         'turn:YOUR_TURN_HOST:443',
    //         'turn:YOUR_TURN_HOST:443?transport=tcp',
    //         'turns:YOUR_TURN_HOST:443?transport=tcp'
    //     ],
    //     username: 'YOUR_USERNAME',
    //     credential: 'YOUR_CREDENTIAL'
    // },

    // ---- Резервен публичен TURN (може да не работи) ----
    {
        urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
    }
];

// Ако искаш да тестваш САМО през TURN (за проверка, че релето работи),
// смени на 'relay'. Нормално трябва да е 'all'.
const ICE_TRANSPORT_POLICY = 'all';

// ---------------------------------------------------------------------------
// Инициализация на Peer
// ---------------------------------------------------------------------------
function initPeer() {
    // Случаен 4-цифрен код между 1000 и 9999
    const shortCode = Math.floor(1000 + Math.random() * 9000).toString();

    peer = new Peer(shortCode, {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        path: '/',
        debug: 2,
        config: {
            iceServers: ICE_SERVERS,
            iceTransportPolicy: ICE_TRANSPORT_POLICY,
            iceCandidatePoolSize: 4
        }
    });

    peer.on('open', (id) => {
        myId = id;
        myPeerIdEl.textContent = id;
        roomIdDisplay.textContent = id;
        statusText.textContent = 'Waiting for connection...';
        appendLog(`System: Room created with code ${id}`);
    });

    peer.on('error', (err) => {
        console.error(err);

        if (err.type === 'unavailable-id') {
            appendLog('System: Code already in use, generating new one...');
            peer.destroy();
            setTimeout(initPeer, 1000);
        } else if (err.type === 'peer-unavailable') {
            appendLog('System Error: Няма такава стая (грешен код или хостът е офлайн).');
            resetConnectUi();
            conn = null;
        } else {
            appendLog('System Error: ' + err.type);
            resetConnectUi();
        }
    });

    // Връзката със сигналния сървър паднала (напр. телефонът сменя Wi-Fi/4G).
    // Вече установените data връзки остават, но без това нови не стават.
    peer.on('disconnected', () => {
        appendLog('System: Signaling server disconnected, reconnecting...');
        if (peer && !peer.destroyed) {
            setTimeout(() => {
                if (peer && !peer.destroyed) peer.reconnect();
            }, 1000);
        }
    });

    // Host mode: някой се свързва към нас
    peer.on('connection', (connection) => {
        if (conn && conn.open) {
            // Вече има активен играч
            connection.on('open', () => connection.close());
            return;
        }
        appendLog('System: Incoming connection, negotiating...');
        setupConnection(connection);
    });
}

// ---------------------------------------------------------------------------
// Общо настройване на връзка (и за host, и за join)
// ---------------------------------------------------------------------------
function setupConnection(connection) {
    conn = connection;

    // Работим с "open" - чак тогава каналът е готов за send()
    const onOpen = () => {
        clearTimeout(connectTimeout);
        statusText.textContent = 'Connected!';
        statusText.className = 'connected';
        chatSection.style.display = 'block';
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect to Room';
        appendLog('System: Data channel open - you can chat now!');
        detectConnectionType(connection);
    };

    if (connection.open) onOpen();
    else connection.on('open', onOpen);

    connection.on('data', (data) => {
        if (!data || typeof data !== 'object') return;
        if (data.type === 'chat') {
            appendLog(`Peer: ${data.text}`);
        } else if (data.type === 'dice_roll') {
            appendLog(`🎲 Peer rolled dice: ${data.dice.join(', ')}`);
        }
    });

    connection.on('close', () => {
        if (conn !== connection) return; // стара връзка
        statusText.textContent = 'Disconnected';
        statusText.className = 'status';
        connTypeEl.textContent = '-';
        appendLog('System: Peer disconnected.');
        conn = null;
        resetConnectUi();
    });

    connection.on('error', (err) => {
        console.error(err);
        appendLog('Connection Error: ' + (err && err.type ? err.type : err));
        resetConnectUi();
    });

    // Следим ICE състоянието - много полезно за дебъг между различни мрежи
    const pc = connection.peerConnection;
    if (pc) {
        pc.addEventListener('iceconnectionstatechange', () => {
            appendLog(`ICE: ${pc.iceConnectionState}`);
            if (pc.iceConnectionState === 'failed') {
                appendLog('System: ICE failed - най-вероятно ти трябва TURN сървър (виж ICE_SERVERS в script.js).');
                resetConnectUi();
            }
        });
    }
}

// Показва дали връзката е директна (P2P) или през TURN релe
async function detectConnectionType(connection) {
    try {
        const pc = connection.peerConnection;
        if (!pc) return;
        await new Promise((r) => setTimeout(r, 1000));
        const stats = await pc.getStats();
        let pair = null;
        const candidates = {};
        stats.forEach((r) => {
            if (r.type === 'local-candidate' || r.type === 'remote-candidate') candidates[r.id] = r;
        });
        stats.forEach((r) => {
            if (r.type === 'candidate-pair' && (r.nominated || r.selected) && r.state === 'succeeded') pair = r;
        });
        if (pair) {
            const local = candidates[pair.localCandidateId];
            const remote = candidates[pair.remoteCandidateId];
            const types = [local && local.candidateType, remote && remote.candidateType];
            const relayed = types.includes('relay');
            connTypeEl.textContent = relayed ? 'Relay (TURN)' : 'Direct (P2P)';
            appendLog(`System: Connection type: ${relayed ? 'relay via TURN' : 'direct P2P'} (${types.join(' / ')})`);
        }
    } catch (e) {
        console.warn('Could not detect connection type', e);
    }
}

function resetConnectUi() {
    clearTimeout(connectTimeout);
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect to Room';
}

// ---------------------------------------------------------------------------
// Join mode
// ---------------------------------------------------------------------------
connectBtn.addEventListener('click', () => {
    const remoteId = peerIdInput.value.trim();
    if (!/^\d{4}$/.test(remoteId)) {
        alert('Please enter a valid 4-digit Room Code');
        return;
    }
    if (remoteId === myId) {
        alert('Това е твоят собствен код. Въведи кода на другия играч.');
        return;
    }
    if (!peer || peer.destroyed || !peer.open) {
        appendLog('System: Още не си свързан със сигналния сървър, изчакай секунда...');
        return;
    }
    if (conn && conn.open) {
        appendLog('System: Already connected.');
        return;
    }

    appendLog(`System: Connecting to room ${remoteId}...`);
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';

    const connection = peer.connect(remoteId, {
        reliable: true,
        serialization: 'json'
    });
    setupConnection(connection);

    // Ако за 20 сек. няма връзка - вероятно NAT проблем
    clearTimeout(connectTimeout);
    connectTimeout = setTimeout(() => {
        if (connection && !connection.open) {
            appendLog('System: Timeout - не се получи връзка. Провери кода или добави TURN сървър.');
            try { connection.close(); } catch (e) {}
            if (conn === connection) conn = null;
            resetConnectUi();
        }
    }, 20000);
});

// ---------------------------------------------------------------------------
// Съобщения
// ---------------------------------------------------------------------------
function safeSend(payload) {
    if (!conn || !conn.open) {
        appendLog('System: Not connected - message not sent.');
        return false;
    }
    try {
        conn.send(payload);
        return true;
    } catch (e) {
        console.error(e);
        appendLog('System: Send failed.');
        return false;
    }
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    if (safeSend({ type: 'chat', text: text })) {
        appendLog(`You: ${text}`);
        messageInput.value = '';
    }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Test dice sync
rollTestBtn.addEventListener('click', () => {
    const dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
    if (safeSend({ type: 'dice_roll', dice: dice })) {
        appendLog(`You rolled dice: ${dice.join(', ')}`);
    }
});

function appendLog(text) {
    const div = document.createElement('div');
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Initialize on load
initPeer();
