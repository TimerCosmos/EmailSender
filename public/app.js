const form = document.getElementById('emailForm');
const statusEl = document.getElementById('status');
const sendBtn = document.getElementById('sendBtn');
const composeBtn = document.getElementById('composeBtn');
const composeSection = document.getElementById('composeSection');

const senderEmailInput = document.getElementById('senderEmail');

const smtpHostInput = document.getElementById('smtpHost');
const smtpPortInput = document.getElementById('smtpPort');
const smtpSecureInput = document.getElementById('smtpSecure');
const smtpUserInput = document.getElementById('smtpUser');
const smtpPassInput = document.getElementById('smtpPass');

const smtpModal = document.getElementById('smtpModal');
const openSmtpSettingsBtn = document.getElementById('openSmtpSettingsBtn');
const closeSmtpSettingsBtn = document.getElementById('closeSmtpSettingsBtn');
const cancelSmtpSettingsBtn = document.getElementById('cancelSmtpSettingsBtn');
const saveSmtpSettingsBtn = document.getElementById('saveSmtpSettingsBtn');

const settingsHost = document.getElementById('settingsHost');
const settingsPort = document.getElementById('settingsPort');
const settingsSecure = document.getElementById('settingsSecure');
const settingsUser = document.getElementById('settingsUser');
const settingsPass = document.getElementById('settingsPass');
const syncUserCheck = document.getElementById('syncUserCheck');

const summaryHost = document.getElementById('summaryHost');
const summaryPort = document.getElementById('summaryPort');
const summarySecure = document.getElementById('summarySecure');

const bf1 = document.getElementById('bf1');
const bf2 = document.getElementById('bf2');

let tracks = [];
let perches = [];
let leadIndex = 0;
let rafHandle = null;
let lastTs = 0;
let lastActivityTs = 0;
let resting = false;
let pendingSendAfterSmtpSave = false;

const lead = { x: 200, y: 180, vx: 0, vy: 0 };
const chase = { x: 260, y: 210, vx: 0, vy: 0 };

const quill = new Quill('#editor', {
  theme: 'snow',
  placeholder: 'Write your email template here...',
  modules: {
    toolbar: [
      [{ font: [] }, { size: ['small', false, 'large', 'huge'] }],
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ align: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ indent: '-1' }, { indent: '+1' }],
      ['blockquote', 'code-block'],
      ['link', 'image'],
      ['clean']
    ]
  }
});

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = `status ${type || ''}`.trim();
}

function syncSenderToSmtpUser() {
  if (!syncUserCheck.checked) return;
  const email = senderEmailInput.value.trim();
  settingsUser.value = email;
  smtpUserInput.value = email;
}

function updateSmtpSummary() {
  summaryHost.textContent = smtpHostInput.value;
  summaryPort.textContent = smtpPortInput.value;
  summarySecure.textContent = smtpSecureInput.value === 'true' ? 'SSL/TLS' : 'STARTTLS';
}

function openSmtpModal() {
  settingsHost.value = smtpHostInput.value || 'smtp.gmail.com';
  settingsPort.value = smtpPortInput.value || '587';
  settingsSecure.value = smtpSecureInput.value || 'false';
  settingsUser.value = smtpUserInput.value || senderEmailInput.value.trim();
  settingsPass.value = smtpPassInput.value || '';
  smtpModal.classList.remove('hidden');
}

function closeSmtpModal() {
  smtpModal.classList.add('hidden');
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function markActivity() {
  lastActivityTs = performance.now();
  if (resting) {
    resting = false;
    bf1.classList.remove('resting');
    bf2.classList.remove('resting');
  }
}

function buildTracks() {
  const topOffset = document.querySelector('.top-nav').getBoundingClientRect().bottom + 16;
  const bottomLimit = window.innerHeight - 56;
  const usableHeight = Math.max(120, bottomLimit - topOffset);
  const laneCount = Math.max(5, Math.floor(usableHeight / 110));

  tracks = Array.from({ length: laneCount }).map((_, i) => {
    const t = laneCount === 1 ? 0.5 : i / (laneCount - 1);
    const y = clamp(topOffset + t * usableHeight, topOffset, bottomLimit);

    // Alternate lane direction geometry so motion uses full width naturally.
    const inset = i % 2 === 0 ? 24 : 52;
    return {
      left: inset,
      right: window.innerWidth - (inset + 70),
      y
    };
  });

  if (!tracks.length) {
    tracks = [{ left: 100, right: window.innerWidth - 120, y: topOffset + 60 }];
  }

  leadIndex = clamp(leadIndex, 0, tracks.length - 1);
}

function buildPerches() {
  const topOffset = document.querySelector('.top-nav').getBoundingClientRect().bottom + 10;
  const labels = Array.from(form.querySelectorAll('h2, label, p'))
    .map((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom <= topOffset || rect.top >= window.innerHeight - 30) return null;
      return {
        x: clamp(rect.left + 28, 20, window.innerWidth - 110),
        y: clamp(rect.top + 4, topOffset, window.innerHeight - 72)
      };
    })
    .filter(Boolean);

  const fullScreenPerches = [
    { x: 120, y: clamp(window.innerHeight * 0.22, topOffset + 20, window.innerHeight - 84) },
    { x: clamp(window.innerWidth * 0.55, 160, window.innerWidth - 160), y: clamp(window.innerHeight * 0.52, topOffset + 40, window.innerHeight - 84) },
    { x: clamp(window.innerWidth * 0.25, 80, window.innerWidth - 120), y: clamp(window.innerHeight * 0.82, topOffset + 60, window.innerHeight - 84) }
  ];

  perches = [...labels.slice(0, 2), ...fullScreenPerches];
}

function advanceTrack() {
  leadIndex = (leadIndex + 1) % tracks.length;
}

function moveEntity(entity, tx, ty, dt, pull, drag) {
  entity.vx += (tx - entity.x) * pull * dt;
  entity.vy += (ty - entity.y) * pull * dt;
  entity.vx *= drag;
  entity.vy *= drag;
  entity.x += entity.vx * dt;
  entity.y += entity.vy * dt;
}

function renderButterflies(t) {
  const flutterA = Math.sin(t / 210) * 3;
  const flutterB = Math.cos(t / 260) * 4;

  const leadAngle = Math.atan2(lead.vy, lead.vx || 0.001) * (180 / Math.PI);
  const chaseAngle = Math.atan2(chase.vy, chase.vx || 0.001) * (180 / Math.PI);

  bf1.style.transform = `translate(${lead.x}px, ${lead.y + flutterA}px) rotate(${leadAngle * 0.2}deg)`;
  bf2.style.transform = `translate(${chase.x}px, ${chase.y + flutterB}px) rotate(${chaseAngle * 0.2}deg)`;
}

function animateButterflies(ts) {
  if (!rafHandle) return;
  if (!lastTs) lastTs = ts;

  const dt = Math.min(0.035, (ts - lastTs) / 1000);
  lastTs = ts;

  if (!tracks.length) buildTracks();
  if (!perches.length) buildPerches();

  if (!resting && ts - lastActivityTs > 2200) {
    resting = true;
    bf1.classList.add('resting');
    bf2.classList.add('resting');
  }

  if (resting) {
    const p1 = perches[0];
    const p2 = perches[Math.min(1, perches.length - 1)];
    moveEntity(lead, p1.x, p1.y, dt, 10, 0.85);
    moveEntity(chase, p2.x + 34, p2.y + 6, dt, 10, 0.85);
    renderButterflies(ts);
    rafHandle = requestAnimationFrame(animateButterflies);
    return;
  }

  const track = tracks[leadIndex];
  const targetX = track.right;
  const targetY = track.y;

  moveEntity(lead, targetX, targetY, dt, 16, 0.9);

  if (Math.abs(lead.x - targetX) < 22) {
    // leader "hops" to next line start
    advanceTrack();
    const next = tracks[leadIndex];
    lead.x = next.left;
    lead.y = next.y - 14;
    lead.vx = 160;
    lead.vy = 40;
  }

  moveEntity(chase, lead.x - 34, lead.y - 10, dt, 11, 0.9);

  if (Math.abs(chase.x - lead.x) < 18 && Math.abs(chase.y - lead.y) < 14) {
    chase.vx -= 60;
    chase.vy -= 30;
  }

  renderButterflies(ts);
  rafHandle = requestAnimationFrame(animateButterflies);
}

function startButterflies() {
  if (rafHandle) return;
  buildTracks();
  const start = tracks[0];
  lead.x = start.left;
  lead.y = start.y;
  chase.x = start.left - 50;
  chase.y = start.y + 16;
  rafHandle = requestAnimationFrame(animateButterflies);
}

composeBtn.addEventListener('click', () => {
  composeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  markActivity();
});

openSmtpSettingsBtn.addEventListener('click', openSmtpModal);
closeSmtpSettingsBtn.addEventListener('click', closeSmtpModal);
cancelSmtpSettingsBtn.addEventListener('click', closeSmtpModal);

smtpModal.addEventListener('click', (event) => {
  if (event.target === smtpModal) closeSmtpModal();
  markActivity();
});

saveSmtpSettingsBtn.addEventListener('click', () => {
  smtpHostInput.value = settingsHost.value.trim() || 'smtp.gmail.com';
  smtpPortInput.value = settingsPort.value.trim() || '587';
  smtpSecureInput.value = settingsSecure.value;
  smtpUserInput.value = settingsUser.value.trim();
  smtpPassInput.value = settingsPass.value;

  updateSmtpSummary();
  closeSmtpModal();
  setStatus('SMTP settings saved.', 'ok');

  if (pendingSendAfterSmtpSave) {
    pendingSendAfterSmtpSave = false;
    setTimeout(() => {
      form.requestSubmit();
    }, 0);
  }
});

syncUserCheck.addEventListener('change', () => {
  if (syncUserCheck.checked) syncSenderToSmtpUser();
});

senderEmailInput.addEventListener('input', syncSenderToSmtpUser);
window.addEventListener(
  'scroll',
  () => {
    buildTracks();
    buildPerches();
    markActivity();
  },
  { passive: true }
);
window.addEventListener('resize', () => {
  buildTracks();
  buildPerches();
  markActivity();
});
form.addEventListener('input', markActivity);
document.addEventListener('pointermove', markActivity, { passive: true });
document.addEventListener('keydown', markActivity);
quill.on('text-change', (_d, _o, source) => {
  if (source === 'user') markActivity();
});

syncSenderToSmtpUser();
updateSmtpSummary();
buildTracks();
buildPerches();
lastActivityTs = performance.now();
startButterflies();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const htmlBody = quill.root.innerHTML.trim();
  if (!htmlBody || htmlBody === '<p><br></p>') {
    setStatus('Template editor cannot be empty.', 'err');
    return;
  }

  if (!smtpUserInput.value.trim() || !smtpPassInput.value.trim()) {
    setStatus('Open SMTP Settings and provide SMTP Username and SMTP Password.', 'err');
    pendingSendAfterSmtpSave = true;
    openSmtpModal();
    return;
  }

  const formData = new FormData(form);
  formData.append('htmlBody', htmlBody);

  sendBtn.disabled = true;
  setStatus('Sending emails... please wait.', '');

  try {
    const response = await fetch('/api/send', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Failed to send email.');
    }

    setStatus(`${data.message}`, 'ok');
  } catch (error) {
    setStatus(error.message, 'err');
  } finally {
    sendBtn.disabled = false;
  }
});
