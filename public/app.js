// Constants & API URLs
const API_BASE = '/api';

// State Management
let state = {
  token: localStorage.getItem('token') || '',
  user: null,
  projects: [],
  activeProject: null,
  voices: [],
};

// DOM Elements
const projectsListSidebar = document.getElementById('projects-list-sidebar');
const btnNewProject = document.getElementById('btn-new-project');
const projectSettingsSec = document.getElementById('project-settings-sec');
const projectTitleInput = document.getElementById('project-title-input');
const btnSaveProjectSettings = document.getElementById('btn-save-project-settings');

const providerSelect = document.getElementById('provider-select');
const fieldsComfyui = document.getElementById('fields-comfyui');
const fieldsFal = document.getElementById('fields-fal');
const fieldsReplicate = document.getElementById('fields-replicate');

const comfyUrlInput = document.getElementById('comfy-url-input');
const falKeyInput = document.getElementById('fal-key-input');
const falModelSelect = document.getElementById('fal-model-select');
const replicateKeyInput = document.getElementById('replicate-key-input');
const replicateModelInput = document.getElementById('replicate-model-input');

const voiceSelect = document.getElementById('voice-select');
const bgMusicInput = document.getElementById('bg-music-input');
const bgVolumeInput = document.getElementById('bg-volume-input');

const noProjectSelectedView = document.getElementById('no-project-selected-view');
const activeProjectViews = document.getElementById('active-project-views');
const btnCreateFirst = document.getElementById('btn-create-first');

const scriptTextarea = document.getElementById('script-textarea');
const btnParseScript = document.getElementById('btn-parse-script');
const sceneCountSpan = document.getElementById('scene-count');
const sceneListContainer = document.getElementById('scene-list-container');
const btnBatchGenerate = document.getElementById('btn-batch-generate');

const charImageInput = document.getElementById('char-image-input');
const btnCharUpload = document.getElementById('btn-char-upload');
const charImagePreviewWrapper = document.getElementById('char-image-preview-wrapper');
const charImagePreview = document.getElementById('char-image-preview');
const charImageFilename = document.getElementById('char-image-filename');
const btnCharRemove = document.getElementById('btn-char-remove');

const btnCompileVideo = document.getElementById('btn-compile-video');
const compileConsole = document.getElementById('compile-console');
const finalVideoWrapper = document.getElementById('final-video-wrapper');

// Auth DOM Elements
const authModal = document.getElementById('auth-modal');
const loginFormWrapper = document.getElementById('login-form-wrapper');
const signupFormWrapper = document.getElementById('signup-form-wrapper');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const btnLoginSubmit = document.getElementById('btn-login-submit');
const linkGotoSignup = document.getElementById('link-goto-signup');

const signupEmailInput = document.getElementById('signup-email');
const signupPasswordInput = document.getElementById('signup-password');
const btnSignupSubmit = document.getElementById('btn-signup-submit');
const linkGotoLogin = document.getElementById('link-goto-login');

const userProfileHeader = document.getElementById('user-profile-header');
const userEmailDisplay = document.getElementById('user-email-display');
const btnLogout = document.getElementById('btn-logout');

// Pro Limit Modal Elements
const proLimitModal = document.getElementById('pro-limit-modal');
const btnUpgradeGopro = document.getElementById('btn-upgrade-gopro');
const btnProClose = document.getElementById('btn-pro-close');

// Modal: New Project DOM Elements
const newProjectModal = document.getElementById('new-project-modal');
const newProjectTitle = document.getElementById('new-project-title');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalSubmit = document.getElementById('btn-modal-submit');

// Modal: AI Script DOM Elements
const btnAiScriptTrigger = document.getElementById('btn-ai-script-trigger');
const aiScriptModal = document.getElementById('ai-script-modal');
const aiScriptTopicInput = document.getElementById('ai-script-topic');
const aiScriptStyleSelect = document.getElementById('ai-script-style');
const aiScriptScenesSelect = document.getElementById('ai-script-scenes');
const btnAiScriptCancel = document.getElementById('btn-ai-script-cancel');
const btnAiScriptSubmit = document.getElementById('btn-ai-script-submit');

// Thumbnail DOM Elements
const btnGenerateThumbnail = document.getElementById('btn-generate-thumbnail');
const thumbnailPreviewWrapper = document.getElementById('thumbnail-preview-wrapper');
const thumbnailPreviewImg = document.getElementById('thumbnail-preview-img');
const btnDownloadThumbnail = document.getElementById('btn-download-thumbnail');
const thumbnailPlaceholder = document.getElementById('thumbnail-placeholder');

// Download Panel DOM Elements
const downloadFormatsCard = document.getElementById('download-formats-card');
const btnDownloadVideo = document.getElementById('btn-download-video');
const btnDownloadScript = document.getElementById('btn-download-script');


// --- API Fetch Wrapper (with Auth Header) ---

async function apiFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (state.token) {
    options.headers['Authorization'] = `Bearer ${state.token}`;
  }
  if (options.body && typeof options.body === 'string' && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, options);

  if (res.status === 401 || res.status === 403) {
    logout();
    throw new Error('Session expired or unauthorized. Please log in again.');
  }

  return res;
}

// --- Helper Functions ---

function logConsole(message, type = 'default') {
  const line = document.createElement('div');
  line.classList.add('console-line', type);
  line.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
  compileConsole.appendChild(line);
  compileConsole.scrollTop = compileConsole.scrollHeight;
}

function loadSavedKeys() {
  if (localStorage.getItem('comfyUrl')) comfyUrlInput.value = localStorage.getItem('comfyUrl');
  if (localStorage.getItem('falKey')) falKeyInput.value = localStorage.getItem('falKey');
  if (localStorage.getItem('replicateKey')) replicateKeyInput.value = localStorage.getItem('replicateKey');
}

function saveKeysToLocalStorage() {
  localStorage.setItem('comfyUrl', comfyUrlInput.value.trim());
  localStorage.setItem('falKey', falKeyInput.value.trim());
  localStorage.setItem('replicateKey', replicateKeyInput.value.trim());
}

// --- AUTHENTICATION FLOW ---

function checkAuth() {
  if (state.token) {
    authModal.classList.add('hidden');
    userProfileHeader.classList.remove('hidden');
    apiFetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          state.user = data.user;
          if (data.user.isPro) {
            userEmailDisplay.innerHTML = `${data.user.email} <span class="badge" style="background:#10b981; color:#fff; font-size:9px; padding:2px 6px; border-radius:10px; margin-left:5px; border:none;">PRO</span>`;
          } else {
            userEmailDisplay.innerText = data.user.email;
          }
          fetchVoices();
          fetchProjects();
        } else {
          logout();
        }
      })
      .catch(() => logout());
  } else {
    authModal.classList.remove('hidden');
    userProfileHeader.classList.add('hidden');
    toggleProjectViews(false);
  }
}

function logout() {
  state.token = '';
  state.user = null;
  state.projects = [];
  state.activeProject = null;
  localStorage.removeItem('token');
  checkAuth();
}

async function handleLogin() {
  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;
  if (!email || !password) {
    alert('Please enter your email and password');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      state.token = data.token;
      localStorage.setItem('token', data.token);
      checkAuth();
    } else {
      alert(data.error || 'Login failed');
    }
  } catch (err) {
    alert('Network error, please try again.');
  }
}

async function handleSignup() {
  const email = signupEmailInput.value.trim();
  const password = signupPasswordInput.value;
  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }
  if (password.length < 6) {
    alert('Password must be at least 6 characters');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      state.token = data.token;
      localStorage.setItem('token', data.token);
      checkAuth();
    } else {
      alert(data.error || 'Sign up failed');
    }
  } catch (err) {
    alert('Network error during signup.');
  }
}

// --- PROJECT MANAGEMENT API CALLS ---

async function fetchProjects() {
  try {
    const res = await apiFetch(`${API_BASE}/projects`);
    state.projects = await res.json();
    renderProjectSidebar();
  } catch (e) {
    console.error('Error fetching projects:', e);
  }
}

async function fetchVoices() {
  try {
    const res = await apiFetch(`${API_BASE}/voices`);
    state.voices = await res.json();
    renderVoiceSelector();
  } catch (e) {
    console.error('Error fetching voices:', e);
  }
}

async function createProject(title, aspectRatio) {
  try {
    const res = await apiFetch(`${API_BASE}/projects`, {
      method: 'POST',
      body: JSON.stringify({ title, aspectRatio })
    });
    const newProj = await res.json();
    
    state.projects.unshift(newProj);
    renderProjectSidebar();
    
    await selectProject(newProj.id);
  } catch (e) {
    alert('Failed to create project');
  }
}

async function selectProject(id) {
  if (!id) {
    state.activeProject = null;
    toggleProjectViews(false);
    return;
  }
  
  try {
    const res = await apiFetch(`${API_BASE}/projects/${id}`);
    state.activeProject = await res.json();
    
    // Populate form fields
    projectTitleInput.value = state.activeProject.title;
    scriptTextarea.value = state.activeProject.script || '';
    bgMusicInput.value = state.activeProject.bgMusic || '';
    
    const ratios = ['ratio-shorts', 'ratio-wide', 'ratio-square', 'ratio-portrait'];
    ratios.forEach(r => {
      const radio = document.getElementById(r);
      if (radio) {
        if (radio.value === state.activeProject.aspectRatio) {
          radio.checked = true;
        }
      }
    });

    toggleProjectViews(true);
    renderActiveProjectDetails();
    renderCharacterImagePreview();
    renderProjectSidebar(); // Update sidebar selection highlight
    logConsole(`Project "${state.activeProject.title}" loaded.`, 'system');
  } catch (e) {
    console.error('Failed to load project:', e);
  }
}

async function saveProjectSettings() {
  if (!state.activeProject) return;
  
  const title = projectTitleInput.value.trim();
  const aspectRatio = document.querySelector('input[name="aspect-ratio"]:checked').value;
  
  try {
    const res = await apiFetch(`${API_BASE}/projects/${state.activeProject.id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, aspectRatio })
    });
    
    state.activeProject = await res.json();
    await fetchProjects();
    renderActiveProjectDetails();
    logConsole('Project settings updated.', 'system');
  } catch (e) {
    alert('Failed to update project settings');
  }
}

async function uploadCharacterImage(file) {
  if (!state.activeProject) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const base64Data = reader.result;
    logConsole('Uploading character reference image...', 'info');

    try {
      const res = await apiFetch(`${API_BASE}/projects/${state.activeProject.id}/upload-character-image`, {
        method: 'POST',
        body: JSON.stringify({ image: base64Data })
      });
      const data = await res.json();
      if (data.success) {
        state.activeProject = data.project;
        renderCharacterImagePreview();
        logConsole('Character reference image uploaded successfully!', 'success');
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (e) {
      logConsole(`Character upload failed: ${e.message}`, 'error');
      alert(`Upload failed: ${e.message}`);
    }
  };
  reader.readAsDataURL(file);
}

async function removeCharacterImage() {
  if (!state.activeProject) return;
  if (!confirm('Are you sure you want to remove the character reference image?')) return;

  logConsole('Removing character reference image...', 'info');

  try {
    const res = await apiFetch(`${API_BASE}/projects/${state.activeProject.id}/remove-character-image`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      state.activeProject = data.project;
      renderCharacterImagePreview();
      charImageInput.value = '';
      logConsole('Character reference image removed.', 'success');
    } else {
      throw new Error(data.error || 'Remove failed');
    }
  } catch (e) {
    logConsole(`Failed to remove character image: ${e.message}`, 'error');
  }
}

function renderCharacterImagePreview() {
  if (state.activeProject && state.activeProject.characterImageUrl) {
    charImagePreview.src = state.activeProject.characterImageUrl;
    charImageFilename.innerText = 'character_reference.png';
    charImagePreviewWrapper.classList.remove('hidden');
    btnCharUpload.innerText = '👤 Change Character Image';
  } else {
    charImagePreview.src = '';
    charImagePreviewWrapper.classList.add('hidden');
    btnCharUpload.innerText = '👤 Upload Character Image';
  }
}

// --- SCRIPT GENERATION & STORYBOARD PARSING ---

async function parseScript() {
  if (!state.activeProject) return;
  const script = scriptTextarea.value.trim();
  if (!script) {
    alert('Please enter a script first!');
    return;
  }

  logConsole('Parsing script into storyboard scenes...', 'info');
  
  try {
    const res = await apiFetch(`${API_BASE}/projects/${state.activeProject.id}/parse-script`, {
      method: 'POST',
      body: JSON.stringify({ script })
    });
    
    state.activeProject = await res.json();
    renderActiveProjectDetails();
    logConsole(`Parsed successfully! Created ${state.activeProject.scenes.length} scenes.`, 'success');
  } catch (e) {
    logConsole('Failed to parse script.', 'error');
  }
}

async function updateSceneDetails(index, updatedScene) {
  if (!state.activeProject) return;
  state.activeProject.scenes[index] = { ...state.activeProject.scenes[index], ...updatedScene };
  
  try {
    await apiFetch(`${API_BASE}/projects/${state.activeProject.id}`, {
      method: 'PUT',
      body: JSON.stringify({ scenes: state.activeProject.scenes })
    });
  } catch (e) {
    console.error('Failed to sync scene edits to server:', e);
  }
}

// --- AI SCRIPT GENERATOR FLOW ---

async function generateScriptAI(topic, style, sceneCount) {
  if (!state.activeProject) return;

  saveKeysToLocalStorage();

  const provider = providerSelect.value;
  const falKey = falKeyInput.value.trim();
  const replicateKey = replicateKeyInput.value.trim();

  logConsole(`Requesting AI Script Generator for topic: "${topic}"...`, 'info');

  try {
    const res = await apiFetch(`${API_BASE}/projects/${state.activeProject.id}/generate-script-ai`, {
      method: 'POST',
      body: JSON.stringify({
        provider,
        falKey,
        replicateKey,
        topic,
        style,
        sceneCount
      })
    });

    const data = await res.json();
    if (data.success) {
      state.activeProject = data.project;
      projectTitleInput.value = state.activeProject.title;
      scriptTextarea.value = state.activeProject.script || '';
      renderActiveProjectDetails();
      logConsole(`AI script and scenes generated successfully! Title: "${state.activeProject.title}"`, 'success');
    } else {
      throw new Error(data.error || 'Failed to generate AI script');
    }
  } catch (e) {
    logConsole(`AI Script Generation failed: ${e.message}`, 'error');
    alert(`AI Script Generation failed: ${e.message}`);
  }
}

// --- SINGLE SCENE / BATCH AI VIDEO GEN ---

async function triggerVoiceGen(index) {
  if (!state.activeProject) return;
  
  const voice = voiceSelect.value;
  const card = document.querySelector(`.scene-card[data-index="${index}"]`);
  const statusIndicator = card.querySelector('.voice-status');
  const btn = card.querySelector('.btn-voice-gen');

  statusIndicator.className = 'status-indicator voice-status generating';
  statusIndicator.innerText = 'Generating Voice';
  btn.disabled = true;

  logConsole(`Generating voiceover for Scene ${index + 1}...`, 'info');

  try {
    const res = await apiFetch(`${API_BASE}/projects/${state.activeProject.id}/scenes/${index}/generate-voice`, {
      method: 'POST',
      body: JSON.stringify({ voice })
    });
    
    const data = await res.json();
    if (data.success) {
      state.activeProject.scenes[index] = data.scene;
      
      statusIndicator.className = 'status-indicator voice-status completed';
      statusIndicator.innerText = 'Voice Ready';
      
      const audioWrapper = card.querySelector('.audio-player-wrapper');
      audioWrapper.innerHTML = `<audio controls src="${data.scene.voiceUrl}"></audio>`;
      logConsole(`Scene ${index + 1} voiceover generated successfully (${data.scene.duration.toFixed(2)}s).`, 'success');
    } else {
      throw new Error(data.error || 'Voice generation failed');
    }
  } catch (e) {
    statusIndicator.className = 'status-indicator voice-status pending';
    statusIndicator.innerText = 'Voice Failed';
    logConsole(`Scene ${index + 1} voice generation failed: ${e.message}`, 'error');
    throw e;
  } finally {
    btn.disabled = false;
  }
}

async function triggerVideoGen(index) {
  if (!state.activeProject) return;

  saveKeysToLocalStorage();

  const provider = providerSelect.value;
  const comfyUrl = comfyUrlInput.value.trim();
  const falKey = falKeyInput.value.trim();
  const replicateKey = replicateKeyInput.value.trim();
  
  let modelConfig = '';
  if (provider === 'fal') modelConfig = falModelSelect.value;
  if (provider === 'replicate') modelConfig = replicateModelInput.value;

  const card = document.querySelector(`.scene-card[data-index="${index}"]`);
  const promptInput = card.querySelector('.scene-prompt-input');
  const customPrompt = promptInput.value.trim();
  
  const statusIndicator = card.querySelector('.video-status');
  const btn = card.querySelector('.btn-video-gen');

  statusIndicator.className = 'status-indicator video-status generating';
  statusIndicator.innerText = 'Generating Video';
  btn.disabled = true;

  logConsole(`Triggering Cloud Video Gen for Scene ${index + 1}...`, 'info');

  try {
    const res = await apiFetch(`${API_BASE}/projects/${state.activeProject.id}/scenes/${index}/generate-video`, {
      method: 'POST',
      body: JSON.stringify({
        provider,
        comfyUrl,
        falKey,
        replicateKey,
        modelConfig,
        customPrompt
      })
    });

    const data = await res.json();
    if (data.success) {
      state.activeProject.scenes[index] = data.scene;

      statusIndicator.className = 'status-indicator video-status completed';
      statusIndicator.innerText = 'Video Ready';

      const previewBox = card.querySelector('.scene-preview-box');
      const ratioClass = state.activeProject.aspectRatio === '9:16' ? 'preview-9-16' : state.activeProject.aspectRatio === '16:9' ? 'preview-16-9' : 'preview-square';
      previewBox.className = `scene-preview-box ${ratioClass}`;
      previewBox.innerHTML = `<video src="${data.scene.videoUrl}" autoplay loop muted controls></video>`;

      logConsole(`Scene ${index + 1} video generated successfully!`, 'success');
    } else {
      throw new Error(data.error || 'Video generation failed');
    }
  } catch (e) {
    statusIndicator.className = 'status-indicator video-status pending';
    statusIndicator.innerText = 'Video Failed';
    logConsole(`Scene ${index + 1} video generation failed: ${e.message}`, 'error');
    if (e.message.includes('limit reached') || e.message.includes('Limit reached') || e.message.includes('429')) {
      showProLimitModal();
    } else {
      alert(`Video Generation Failed: ${e.message}`);
    }
    throw e;
  } finally {
    btn.disabled = false;
  }
}

async function regenerateScene(index) {
  logConsole(`Starting complete regeneration for Scene ${index + 1}...`, 'info');
  try {
    await triggerVoiceGen(index);
    await triggerVideoGen(index);
    logConsole(`Scene ${index + 1} fully regenerated!`, 'success');
  } catch (err) {
    logConsole(`Full regeneration for Scene ${index + 1} stopped due to errors.`, 'error');
  }
}

async function batchGenerateAll() {
  if (!state.activeProject) return;
  if (state.activeProject.scenes.length === 0) {
    alert('Please parse your script into scenes first!');
    return;
  }

  btnBatchGenerate.disabled = true;
  btnBatchGenerate.innerText = '⚡ Generating Batch...';
  logConsole('Starting batch generation for all scenes...', 'info');

  try {
    const total = state.activeProject.scenes.length;
    for (let i = 0; i < total; i++) {
      logConsole(`--- Processing Scene ${i + 1} of ${total} ---`, 'info');
      
      const scene = state.activeProject.scenes[i];
      if (scene.voiceoverStatus !== 'completed') {
        logConsole(`Scene ${i + 1}: Voiceover is pending. Generating...`, 'info');
        await triggerVoiceGen(i);
      } else {
        logConsole(`Scene ${i + 1}: Voiceover already generated. Skipping.`, 'info');
      }

      if (scene.videoStatus !== 'completed') {
        logConsole(`Scene ${i + 1}: Video is pending. Generating via cloud...`, 'info');
        await triggerVideoGen(i);
      } else {
        logConsole(`Scene ${i + 1}: Video already generated. Skipping.`, 'info');
      }
    }

    logConsole('All scenes generated successfully! Compile is ready.', 'success');

  } catch (e) {
    logConsole(`Batch generation failed: ${e.message}`, 'error');
    alert(`Batch generation stopped: ${e.message}`);
  } finally {
    btnBatchGenerate.disabled = false;
    btnBatchGenerate.innerText = '⚡ Batch Generate All';
  }
}

// --- VIDEO STITCHING / COMPILATION WITH ASYNC POLLING ---

async function compileVideo() {
  if (!state.activeProject) return;

  const bgMusic = bgMusicInput.value.trim();
  const bgVolume = parseFloat(bgVolumeInput.value) || 0.08;
  const burnCaptions = document.getElementById('check-burn-captions').checked;

  btnCompileVideo.disabled = true;
  logConsole('Starting asynchronous compilation on server. Please wait...', 'info');

  try {
    const res = await apiFetch(`${API_BASE}/projects/${state.activeProject.id}/compile`, {
      method: 'POST',
      body: JSON.stringify({ bgMusic, bgVolume, burnCaptions })
    });

    const data = await res.json();
    if (data.success) {
      logConsole('Compilation queued successfully on server. Polling progress...', 'info');
      pollCompileStatus(state.activeProject.id);
    } else {
      throw new Error(data.error || 'Failed to initialize compilation');
    }
  } catch (e) {
    logConsole(`Compilation failed: ${e.message}`, 'error');
    if (e.message.includes('limit reached') || e.message.includes('Limit reached') || e.message.includes('429')) {
      showProLimitModal();
    } else {
      alert(`Compilation failed: ${e.message}`);
    }
    btnCompileVideo.disabled = false;
  }
}

function pollCompileStatus(projectId) {
  const interval = setInterval(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/projects/${projectId}/compile-status`);
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Status check failed');
      }

      if (data.status === 'completed') {
        clearInterval(interval);
        logConsole('Compilation succeeded! Rendering final video...', 'success');
        
        state.activeProject.compiledVideoUrl = data.videoUrl;
        renderActiveProjectDetails();
        btnCompileVideo.disabled = false;
      } else if (data.status === 'failed') {
        clearInterval(interval);
        logConsole(`Compilation failed on server: ${data.error}`, 'error');
        alert(`Compilation failed: ${data.error}`);
        btnCompileVideo.disabled = false;
      } else if (data.status === 'compiling') {
        logConsole(`Compilation: ${data.currentStep}...`, 'info');
      }
    } catch (err) {
      clearInterval(interval);
      logConsole(`Status check failed: ${err.message}`, 'error');
      alert(`Stitching check failed: ${err.message}`);
      btnCompileVideo.disabled = false;
    }
  }, 3000);
}

// --- THUMBNAIL COVER GENERATOR ---

async function generateThumbnail() {
  if (!state.activeProject) return;

  saveKeysToLocalStorage();

  const provider = providerSelect.value;
  const falKey = falKeyInput.value.trim();
  const replicateKey = replicateKeyInput.value.trim();

  btnGenerateThumbnail.disabled = true;
  btnGenerateThumbnail.innerText = 'Generating...';
  logConsole('Triggering AI Cover Card Generation...', 'info');

  try {
    const res = await apiFetch(`${API_BASE}/projects/${state.activeProject.id}/generate-thumbnail`, {
      method: 'POST',
      body: JSON.stringify({ provider, falKey, replicateKey })
    });

    const data = await res.json();
    if (data.success) {
      state.activeProject.thumbnailUrl = data.thumbnailUrl;
      renderActiveProjectDetails();
      logConsole('Cover card generated successfully!', 'success');
    } else {
      throw new Error(data.error || 'Thumbnail failed');
    }
  } catch (e) {
    logConsole(`Cover card failed: ${e.message}`, 'error');
    alert(`Cover generation failed: ${e.message}`);
  } finally {
    btnGenerateThumbnail.disabled = false;
    btnGenerateThumbnail.innerText = '🎨 Generate Cover';
  }
}

// --- RENDERING FUNCTIONS ---

function renderProjectSidebar() {
  if (state.projects.length === 0) {
    projectsListSidebar.innerHTML = '<div style="text-align:center; padding:15px; color:var(--text-dark); font-size:11px;">No projects yet.</div>';
    return;
  }
  projectsListSidebar.innerHTML = '';
  
  state.projects.forEach(p => {
    const item = document.createElement('div');
    item.className = 'project-sidebar-item';
    if (state.activeProject && state.activeProject.id === p.id) {
      item.classList.add('active');
    }
    
    // Explicit flex styles
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '8px 10px';
    item.style.background = state.activeProject && state.activeProject.id === p.id ? 'rgba(138, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)';
    item.style.border = '1px solid rgba(255, 255, 255, 0.05)';
    item.style.borderRadius = '6px';
    item.style.cursor = 'pointer';
    item.style.marginBottom = '6px';
    item.style.transition = 'all 0.2s';
    
    const info = document.createElement('div');
    info.style.flexGrow = '1';
    info.style.display = 'flex';
    info.style.flexDirection = 'column';
    info.style.gap = '2px';
    
    const title = document.createElement('span');
    title.innerText = p.title;
    title.style.fontSize = '12px';
    title.style.fontWeight = '600';
    title.style.color = 'var(--text-main)';
    
    const meta = document.createElement('span');
    meta.innerText = `${p.aspectRatio} • ${new Date(p.createdAt).toLocaleDateString()}`;
    meta.style.fontSize = '10px';
    meta.style.color = 'var(--text-dark)';
    
    info.appendChild(title);
    info.appendChild(meta);
    
    info.addEventListener('click', () => selectProject(p.id));
    
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '🗑️';
    delBtn.style.background = 'none';
    delBtn.style.border = 'none';
    delBtn.style.color = '#ff5555';
    delBtn.style.cursor = 'pointer';
    delBtn.style.fontSize = '12px';
    delBtn.style.padding = '4px';
    
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Are you sure you want to delete project "${p.title}"?`)) return;
      try {
        const res = await apiFetch(`/api/projects/${p.id}`, { method: 'DELETE' });
        if (res.ok) {
          state.projects = state.projects.filter(proj => proj.id !== p.id);
          if (state.activeProject && state.activeProject.id === p.id) {
            state.activeProject = null;
            toggleProjectViews(false);
          }
          renderProjectSidebar();
          logConsole(`Deleted project "${p.title}"`, 'system');
        }
      } catch (err) {
        alert('Failed to delete project');
      }
    });
    
    item.appendChild(info);
    item.appendChild(delBtn);
    projectsListSidebar.appendChild(item);
  });
}

function renderVoiceSelector() {
  voiceSelect.innerHTML = '';
  state.voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.ShortName;
    opt.innerText = v.FriendlyName;
    if (v.ShortName === 'en-US-GuyNeural') opt.selected = true;
    voiceSelect.appendChild(opt);
  });
}

function toggleProjectViews(isSelected) {
  if (isSelected) {
    noProjectSelectedView.classList.add('hidden');
    activeProjectViews.classList.remove('hidden');
    projectSettingsSec.classList.remove('disabled');
  } else {
    noProjectSelectedView.classList.remove('hidden');
    activeProjectViews.classList.add('hidden');
    projectSettingsSec.classList.add('disabled');
  }
}

function renderActiveProjectDetails() {
  if (!state.activeProject) return;

  sceneCountSpan.innerText = state.activeProject.scenes.length;
  sceneListContainer.innerHTML = '';

  state.activeProject.scenes.forEach((scene, index) => {
    const card = document.createElement('div');
    card.className = 'scene-card';
    card.setAttribute('data-index', index);

    // Dynamic resolution aspect ratio classes
    let ratioClass = 'preview-9-16';
    if (state.activeProject.aspectRatio === '16:9') ratioClass = 'preview-16-9';
    else if (state.activeProject.aspectRatio === '1:1') ratioClass = 'preview-square';
    else if (state.activeProject.aspectRatio === '4:5') ratioClass = 'preview-portrait';

    card.innerHTML = `
      <div class="scene-num">${index + 1}</div>
      <div class="scene-content">
        <div>
          <span class="scene-text-label">Narration Script</span>
          <p style="margin-top: 4px; font-size: 14px; line-height: 1.5; color: var(--text-main);">${scene.text}</p>
        </div>
        <div style="margin-top: 8px;">
          <span class="scene-prompt-label">AI Video Prompt</span>
          <textarea class="input-field scene-prompt-input" style="min-height: 50px; margin-top: 4px; font-size: 12px;" placeholder="Visual description for AI...">${scene.prompt}</textarea>
        </div>
        
        <div class="audio-player-wrapper">
          ${scene.voiceUrl ? `<audio controls src="${scene.voiceUrl}"></audio>` : '<span style="font-size:12px; color:var(--text-dark);">Voiceover not generated</span>'}
        </div>
      </div>
      <div class="scene-actions" style="display:flex; flex-direction:column; gap:6px;">
        <span class="status-indicator voice-status ${scene.voiceoverStatus || 'pending'}">
          ${scene.voiceoverStatus === 'completed' ? 'Voice Ready' : scene.voiceoverStatus === 'generating' ? 'Generating Voice' : 'Voice Pending'}
        </span>
        <button class="btn btn-secondary btn-sm btn-voice-gen">🗣️ Generate Voice</button>

        <div class="scene-preview-box ${ratioClass}">
          ${scene.videoUrl ? `<video src="${scene.videoUrl}" autoplay loop muted controls></video>` : '<span class="placeholder">Video not generated</span>'}
        </div>
        
        <span class="status-indicator video-status ${scene.videoStatus || 'pending'}">
          ${scene.videoStatus === 'completed' ? 'Video Ready' : scene.videoStatus === 'generating' ? 'Generating Video' : 'Video Pending'}
        </span>
        <button class="btn btn-primary btn-sm btn-video-gen">📹 Generate Video</button>

        <button class="btn btn-secondary btn-xs btn-scene-regen" style="margin-top:4px; font-size:10px; padding:4px 6px;">⚡ Regenerate Scene</button>
      </div>
    `;

    const promptInput = card.querySelector('.scene-prompt-input');
    promptInput.addEventListener('change', () => {
      updateSceneDetails(index, { prompt: promptInput.value.trim() });
    });

    card.querySelector('.btn-voice-gen').addEventListener('click', () => triggerVoiceGen(index));
    card.querySelector('.btn-video-gen').addEventListener('click', () => triggerVideoGen(index));
    card.querySelector('.btn-scene-regen').addEventListener('click', () => regenerateScene(index));

    sceneListContainer.appendChild(card);
  });

  // Load thumbnail if available
  if (state.activeProject.thumbnailUrl) {
    thumbnailPreviewImg.src = state.activeProject.thumbnailUrl;
    thumbnailPreviewWrapper.classList.remove('hidden');
    thumbnailPlaceholder.classList.add('hidden');
  } else {
    thumbnailPreviewImg.src = '';
    thumbnailPreviewWrapper.classList.add('hidden');
    thumbnailPlaceholder.classList.remove('hidden');
  }

  // Load compiled output if already available
  if (state.activeProject.compiledVideoUrl) {
    let ratioClass = 'shorts-ratio';
    if (state.activeProject.aspectRatio === '16:9') ratioClass = 'wide-ratio';
    else if (state.activeProject.aspectRatio === '1:1') ratioClass = 'square-ratio';
    else if (state.activeProject.aspectRatio === '4:5') ratioClass = 'portrait-ratio';

    finalVideoWrapper.className = `video-preview-wrapper ${ratioClass}`;
    finalVideoWrapper.innerHTML = `<video src="${state.activeProject.compiledVideoUrl}" controls style="width:100%;height:100%;"></video>`;
    
    // Enable downloads
    downloadFormatsCard.classList.remove('hidden');
  } else {
    finalVideoWrapper.className = 'video-preview-wrapper';
    finalVideoWrapper.innerHTML = `<div class="video-placeholder"><span>No render compiled yet</span></div>`;
    downloadFormatsCard.classList.add('hidden');
  }
}

// --- CLIENT-SIDE FILE DOWNLOAD HELPER ---

function triggerClientDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// --- EVENT LISTENERS ---

// Auth buttons
btnLoginSubmit.addEventListener('click', handleLogin);
btnSignupSubmit.addEventListener('click', handleSignup);
btnLogout.addEventListener('click', logout);

linkGotoSignup.addEventListener('click', (e) => {
  e.preventDefault();
  loginFormWrapper.classList.add('hidden');
  signupFormWrapper.classList.remove('hidden');
});

linkGotoLogin.addEventListener('click', (e) => {
  e.preventDefault();
  signupFormWrapper.classList.add('hidden');
  loginFormWrapper.classList.remove('hidden');
});

// Provider switcher
providerSelect.addEventListener('change', () => {
  const prov = providerSelect.value;
  fieldsComfyui.classList.add('hidden');
  fieldsFal.classList.add('hidden');
  fieldsReplicate.classList.add('hidden');

  if (prov === 'comfyui') fieldsComfyui.classList.remove('hidden');
  if (prov === 'fal') fieldsFal.classList.remove('hidden');
  if (prov === 'replicate') fieldsReplicate.classList.remove('hidden');
});

// Settings save
btnSaveProjectSettings.addEventListener('click', saveProjectSettings);

// Project creation triggers
btnNewProject.addEventListener('click', () => {
  newProjectTitle.value = '';
  newProjectModal.classList.remove('hidden');
  newProjectTitle.focus();
});

btnCreateFirst.addEventListener('click', () => {
  newProjectTitle.value = '';
  newProjectModal.classList.remove('hidden');
  newProjectTitle.focus();
});

btnModalCancel.addEventListener('click', () => {
  newProjectModal.classList.add('hidden');
});

btnModalSubmit.addEventListener('click', () => {
  const title = newProjectTitle.value.trim();
  const format = document.querySelector('input[name="new-aspect-ratio"]:checked').value;
  if (!title) {
    alert('Please enter a project name.');
    return;
  }
  newProjectModal.classList.add('hidden');
  createProject(title, format);
});

// Script parse
btnParseScript.addEventListener('click', parseScript);

// AI Script Modal triggers
btnAiScriptTrigger.addEventListener('click', () => {
  aiScriptTopicInput.value = '';
  aiScriptModal.classList.remove('hidden');
  aiScriptTopicInput.focus();
});

btnAiScriptCancel.addEventListener('click', () => {
  aiScriptModal.classList.add('hidden');
});

btnAiScriptSubmit.addEventListener('click', () => {
  const topic = aiScriptTopicInput.value.trim();
  const style = aiScriptStyleSelect.value;
  const count = aiScriptScenesSelect.value;

  if (!topic) {
    alert('Please enter a script topic or idea');
    return;
  }

  aiScriptModal.classList.add('hidden');
  generateScriptAI(topic, style, count);
});

// Template Quick Presets
document.querySelectorAll('.btn-template').forEach(btn => {
  btn.addEventListener('click', () => {
    const preset = btn.getAttribute('data-preset');
    let text = '';
    
    if (preset === 'shorts') {
      text = `HOOK: Did you know that your phone has a hidden secret? (Scene 1)\nHere is the shocking truth behind screen timers. (Scene 2)\nMost apps are literally engineered to capture your dopamine receptors. (Scene 3)\nBut you can break the loop by turning your display to greyscale. (Scene 4)\nCall to Action: Try this right now and comment below if it worked! (Scene 5)`;
    } else if (preset === 'motivational') {
      text = `Every single day, you are presented with two choices. (Scene 1)\nYou can either stay in bed and dream of success. (Scene 2)\nOr you can get up, face the grind, and build your legacy. (Scene 3)\nNo excuses. No complaints. Only execution. (Scene 4)\nKeep pushing forward, because your future self is watching. (Scene 5)`;
    } else if (preset === 'kids') {
      text = `Once upon a time, there was a little bear named Barnaby. (Scene 1)\nBarnaby loved looking at the shiny, glowing stars in the night sky. (Scene 2)\nOne evening, a golden shooting star landed right in his backyard! (Scene 3)\nHe made a secret wish and held the star close to his heart. (Scene 4)\nSuddenly, Barnaby realized he could fly high among the treetops! (Scene 5)`;
    } else if (preset === 'facts') {
      text = `In 1518, a bizarre event took place in Strasbourg, France. (Scene 1)\nIt was known as the Dancing Plague, where people danced uncontrollably for weeks. (Scene 2)\nIt started with a single woman and quickly spread to hundreds. (Scene 3)\nScientists today still debate whether it was mass hysteria or ergot poisoning. (Scene 4)\nFollow for more bizarre mysteries throughout human history! (Scene 5)`;
    }

    scriptTextarea.value = text;
    logConsole(`Loaded quick template preset: "${preset}"`, 'info');
  });
});

// Compile & Thumbnail events
btnCompileVideo.addEventListener('click', compileVideo);
btnGenerateThumbnail.addEventListener('click', generateThumbnail);

// Downloads
btnDownloadVideo.addEventListener('click', () => {
  if (state.activeProject && state.activeProject.compiledVideoUrl) {
    triggerClientDownload(state.activeProject.compiledVideoUrl, `${state.activeProject.title}_video.mp4`);
  }
});

btnDownloadScript.addEventListener('click', () => {
  if (state.activeProject && state.activeProject.script) {
    const blob = new Blob([state.activeProject.script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    triggerClientDownload(url, `${state.activeProject.title}_script.txt`);
    URL.revokeObjectURL(url);
  }
});

btnDownloadThumbnail.addEventListener('click', () => {
  if (state.activeProject && state.activeProject.thumbnailUrl) {
    triggerClientDownload(state.activeProject.thumbnailUrl, `${state.activeProject.title}_thumbnail.jpg`);
  }
});

// Batch Gen
btnBatchGenerate.addEventListener('click', batchGenerateAll);

// Character upload
btnCharUpload.addEventListener('click', () => {
  charImageInput.click();
});

charImageInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    uploadCharacterImage(e.target.files[0]);
  }
});

btnCharRemove.addEventListener('click', removeCharacterImage);

// Pro Limit Modal Event Listeners & Functions
function showProLimitModal() {
  proLimitModal.classList.remove('hidden');
}

function hideProLimitModal() {
  proLimitModal.classList.add('hidden');
}

btnProClose.addEventListener('click', hideProLimitModal);

btnUpgradeGopro.addEventListener('click', async () => {
  btnUpgradeGopro.disabled = true;
  btnUpgradeGopro.innerText = 'Initializing...';
  
  try {
    const configRes = await apiFetch(`${API_BASE}/config/razorpay-key`);
    const configData = await configRes.json();
    const keyId = configData.keyId;

    if (!keyId || keyId === 'rzp_test_placeholder_key') {
      console.warn('Razorpay Key ID is not configured on the server. Falling back to test checkout.');
    }

    const options = {
      key: keyId,
      amount: 99900, // Rs. 999 in subunits
      currency: "INR",
      name: "AI Video Studio Pro",
      description: "Unlock unlimited video generation & compilation",
      image: "https://unpkg.com/@lucide/lab/icons/clapperboard.svg",
      handler: async function (response) {
        btnUpgradeGopro.innerText = 'Upgrading...';
        try {
          const verifyRes = await apiFetch(`${API_BASE}/payments/upgrade-pro`, {
            method: 'POST',
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            alert('🎉 Upgrade Succeeded! You are now a PRO user.');
            hideProLimitModal();
            checkAuth(); // refresh UI to display PRO badge
          } else {
            alert(`Upgrade failed: ${verifyData.error}`);
          }
        } catch (err) {
          console.error(err);
          alert('Upgrade failed. Please contact support.');
        } finally {
          btnUpgradeGopro.disabled = false;
          btnUpgradeGopro.innerText = 'Upgrade to Pro (₹999/mo) 💳';
        }
      },
      prefill: {
        email: state.user ? state.user.email : "",
      },
      theme: {
        color: "#8a5cf6"
      },
      modal: {
        ondismiss: function() {
          btnUpgradeGopro.disabled = false;
          btnUpgradeGopro.innerText = 'Upgrade to Pro (₹999/mo) 💳';
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();

  } catch (err) {
    console.error(err);
    alert('Failed to initialize Razorpay.');
    btnUpgradeGopro.disabled = false;
    btnUpgradeGopro.innerText = 'Upgrade to Pro (₹999/mo) 💳';
  }
});

// App initialization
window.addEventListener('DOMContentLoaded', async () => {
  loadSavedKeys();
  checkAuth();
  logConsole('AI Video Content Studio dashboard initialized.', 'system');
});
