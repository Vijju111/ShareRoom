const socket = io();
let username = '', room = 'general', darkMode = false;

function joinChat() {
  username = document.getElementById('username').value.trim();
  room = document.getElementById('room-select').value;
  darkMode = document.getElementById('dark-mode-toggle').checked;
  if (!username) return alert('Enter your name!');
  if (darkMode) document.body.setAttribute('data-theme', 'dark');
  document.getElementById('entry-screen').style.display = 'none';
  document.getElementById('chat-container').style.display = 'flex';
  document.getElementById('room-title').textContent = {
    general:'💬 General', tech:'💻 Tech', music:'🎵 Music', art:'🎨 Art'
  }[room] || '💬 '+room;
  socket.emit('join room', { username, room });
}

function toggleTheme() {
  darkMode = !darkMode;
  darkMode ? document.body.setAttribute('data-theme','dark') : document.body.removeAttribute('data-theme');
}

function sendMessage() {
  const msg = document.getElementById('message-input').value.trim();
  if (!msg) return;
  socket.emit('send message', { username, room, content: msg });
  document.getElementById('message-input').value = '';
}

document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 40*1024*1024) { alert('Max 40MB!'); e.target.value=''; return; }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('username', username);
  formData.append('room', room);
  fetch('/upload', { method:'POST', body:formData })
    .then(() => e.target.value = '')
    .catch(() => { alert('Upload failed'); e.target.value = ''; });
});

socket.on('init messages', data => {
  document.getElementById('messages').innerHTML = '';
  data.messages.forEach(addMessageToDOM);
});

socket.on('new message', addMessageToDOM);

function addMessageToDOM(msg) {
  if (msg.room !== room) return;
  const div = document.getElementById('messages');
  const el = document.createElement('div');
  el.classList.add('message', msg.type);
  if (msg.username === username) el.classList.add('own');
  el.innerHTML = `<div><strong>${msg.username}</strong> <small>${new Date(msg.timestamp).toLocaleTimeString()}</small></div>`;
  if (msg.type === 'text') el.textContent = msg.content;
  else if (msg.type === 'image') el.appendChild(Object.assign(document.createElement('img'), { src: msg.content, alt: 'img' }));
  else if (msg.type === 'audio') el.appendChild(Object.assign(document.createElement('audio'), { controls: true, src: msg.content }));
  else if (msg.type === 'file') {
    const a = document.createElement('a');
    a.href = msg.content;
    a.textContent = `📎 ${decodeURIComponent(msg.content.split('/').pop())}`;
    a.target = '_blank';
    el.appendChild(a);
  }
  div.appendChild(el);
  div.scrollTop = div.scrollHeight;
}

function logout() { if (confirm('Leave?')) location.reload(); }

document.getElementById('message-input').addEventListener('keypress', e => {
  if (e.key === 'Enter') sendMessage();
});