// Constants & API URLs
const API_BASE = '/api';

// State Management
let state = {
  projects: [],
  activeProject: null,
  voices: [],
};

// DOM Elements
const projectSelector = document.getElementById('project-selector');
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

// Modal Elements
const newProjectModal = document.getElementById('new-project-modal');
const newProjectTitle = document.getElementById('new-project-title');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalSubmit = document.getElementById('btn-modal-submit');

// --- Helper Functions ---
function logConsole(message, type = 'default') {
  const line = document.createElement('div');
  line.classList.add('console-line', type);
  line.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
  compileConsole.appendChild(line);
  compileConsole.scrollTop = compileConsole.scrollHeight;
}

// Save provider keys to local storage for convenience
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

// --- API Calls ---

// Fetch project list
async function fetchProjects() {
  try {
    const res = await fetch(`${API_BASE}/projects`);
    state.projects = await res.json();
    renderProjectSelector();
  } catch (e) {
    console.error('Error fetching projects:', e);
  }
}

// Fetch Edge-TTS voices
async function fetchVoices() {
  try {
    const res = await fetch(`${API_BASE}/voices`);
    state.voices = await res.json();
    renderVoiceSelector();
  } catch (e) {
    console.error('Error fetching voices:', e);
  }
}

// Create new project
async function createProject(title, aspectRatio) {
  try {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, aspectRatio })
    });
    const newProj = await res.json();
    
    // Add to project list & select it
    state.projects.unshift(newProj);
    renderProjectSelector();
    
    projectSelector.value = newProj.id;
    await selectProject(newProj.id);
  } catch (e) {
    alert('Failed to create project');
  }
}

// Select/Load active project
async function selectProject(id) {
  if (!id) {
    state.activeProject = null;
    toggleProjectViews(false);
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    state.activeProject = await res.json();
    
    // Populate form fields
    projectTitleInput.value = state.activeProject.title;
    scriptTextarea.value = state.activeProject.script || '';
    bgMusicInput.value = state.activeProject.bgMusic || '';
    
    if (state.activeProject.aspectRatio === '16:9') {
      document.getElementById('ratio-wide').checked = true;
    } else {
      document.getElementById('ratio-shorts').checked = true;
    }

    toggleProjectViews(true);
    renderActiveProjectDetails();
    renderCharacterImagePreview();
    logConsole(`Project "${state.activeProject.title}" loaded successfully.`, 'system');
  } catch (e) {
    console.error('Failed to load project:', e);
  }
}

// Upload Character Reference Image
async function uploadCharacterImage(file) {
  if (!state.activeProject) return;

  const reader = new FileReader();
  reader.onload = async () => {
    const base64Data = reader.result;
    logConsole('Uploading character reference image...', 'info');

    try {
      const res = await fetch(`${API_BASE}/projects/${state.activeProject.id}/upload-character-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

// Remove Character Reference Image
async function removeCharacterImage() {
  if (!state.activeProject) return;
  if (!confirm('Are you sure you want to remove the character reference image?')) return;

  logConsole('Removing character reference image...', 'info');

  try {
    const res = await fetch(`${API_BASE}/projects/${state.activeProject.id}/remove-character-image`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      state.activeProject = data.project;
      renderCharacterImagePreview();
      charImageInput.value = ''; // clear input value
      logConsole('Character reference image removed.', 'success');
    } else {
      throw new Error(data.error || 'Remove failed');
    }
  } catch (e) {
    logConsole(`Failed to remove character image: ${e.message}`, 'error');
  }
}

// Render Character Image Preview in Sidebar
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

// Update project settings
async function saveProjectSettings() {
  if (!state.activeProject) return;
  
  const title = projectTitleInput.value.trim();
  const aspectRatio = document.querySelector('input[name="aspect-ratio"]:checked').value;
  
  try {
    const res = await fetch(`${API_BASE}/projects/${state.activeProject.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, aspectRatio })
    });
    
    state.activeProject = await res.json();
    await fetchProjects();
    projectSelector.value = state.activeProject.id;
    renderActiveProjectDetails();
    logConsole('Project settings updated.', 'system');
  } catch (e) {
    alert('Failed to update project settings');
  }
}

// Parse script
async function parseScript() {
  if (!state.activeProject) return;
  const script = scriptTextarea.value.trim();
  if (!script) {
    alert('Please enter a script first!');
    return;
  }

  logConsole('Parsing script into storyboard scenes...', 'info');
  
  try {
    const res = await fetch(`${API_BASE}/projects/${state.activeProject.id}/parse-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script })
    });
    
    state.activeProject = await res.json();
    renderActiveProjectDetails();
    logConsole(`Parsed successfully! Created ${state.activeProject.scenes.length} scenes.`, 'success');
  } catch (e) {
    logConsole('Failed to parse script.', 'error');
  }
}

// Update single scene details (e.g. edited prompt)
async function updateSceneDetails(index, updatedScene) {
  if (!state.activeProject) return;
  state.activeProject.scenes[index] = { ...state.activeProject.scenes[index], ...updatedScene };
  
  // Save active project back to server
  try {
    await fetch(`${API_BASE}/projects/${state.activeProject.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenes: state.activeProject.scenes })
    });
  } catch (e) {
    console.error('Failed to sync scene edits to server:', e);
  }
}

// Generate Voice for a scene
async function triggerVoiceGen(index) {
  if (!state.activeProject) return;
  
  const voice = voiceSelect.value;
  const card = document.querySelector(`.scene-card[data-index="${index}"]`);
  const statusIndicator = card.querySelector('.voice-status');
  const btn = card.querySelector('.btn-voice-gen');

  // UI state updates
  statusIndicator.className = 'status-indicator voice-status generating';
  statusIndicator.innerText = 'Generating Voice';
  btn.disabled = true;

  logConsole(`Generating voiceover for Scene ${index + 1}...`, 'info');

  try {
    const res = await fetch(`${API_BASE}/projects/${state.activeProject.id}/scenes/${index}/generate-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice })
    });
    
    const data = await res.json();
    if (data.success) {
      state.activeProject.scenes[index] = data.scene;
      
      // Update scene card UI
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
  } finally {
    btn.disabled = false;
  }
}

// Generate Video for a scene
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

  // UI state updates
  statusIndicator.className = 'status-indicator video-status generating';
  statusIndicator.innerText = 'Generating Video';
  btn.disabled = true;

  logConsole(`Triggering Cloud Video Gen for Scene ${index + 1}...`, 'info');

  try {
    const res = await fetch(`${API_BASE}/projects/${state.activeProject.id}/scenes/${index}/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

      // Update scene card UI
      statusIndicator.className = 'status-indicator video-status completed';
      statusIndicator.innerText = 'Video Ready';

      const previewBox = card.querySelector('.scene-preview-box');
      const ratioClass = state.activeProject.aspectRatio === '9:16' ? 'preview-9-16' : 'preview-16-9';
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
  } finally {
    btn.disabled = false;
  }
}

// Compile final video
async function compileVideo() {
  if (!state.activeProject) return;

  const bgMusic = bgMusicInput.value.trim();
  const bgVolume = parseFloat(bgVolumeInput.value) || 0.08;

  btnCompileVideo.disabled = true;
  logConsole('Starting compilation of all scenes. Please wait...', 'info');

  try {
    const res = await fetch(`${API_BASE}/projects/${state.activeProject.id}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bgMusic, bgVolume })
    });

    const data = await res.json();
    if (data.success) {
      logConsole('Compilation succeeded! Rendering output preview...', 'success');
      
      const ratioClass = state.activeProject.aspectRatio === '9:16' ? 'shorts-ratio' : 'wide-ratio';
      finalVideoWrapper.className = `video-preview-wrapper ${ratioClass}`;
      finalVideoWrapper.innerHTML = `<video src="${data.videoUrl}" controls autoplay style="width:100%;height:100%;"></video>`;
    } else {
      throw new Error(data.error || 'Compilation failed');
    }
  } catch (e) {
    logConsole(`Compilation failed: ${e.message}`, 'error');
    alert(`Compilation failed: ${e.message}`);
  } finally {
    btnCompileVideo.disabled = false;
  }
}

// Batch generate voice and video for all scenes, then compile
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
      
      // 1. Generate voice if not already completed
      const scene = state.activeProject.scenes[i];
      if (scene.voiceoverStatus !== 'completed') {
        logConsole(`Scene ${i + 1}: Voiceover is pending. Generating...`, 'info');
        await triggerVoiceGen(i);
        // Refresh scene ref after generation
        const freshScene = state.activeProject.scenes[i];
        if (freshScene.voiceoverStatus !== 'completed') {
          throw new Error(`Voiceover generation failed for Scene ${i + 1}`);
        }
      } else {
        logConsole(`Scene ${i + 1}: Voiceover already generated. Skipping.`, 'info');
      }

      // 2. Generate video if not already completed
      if (scene.videoStatus !== 'completed') {
        logConsole(`Scene ${i + 1}: Video is pending. Generating via cloud...`, 'info');
        await triggerVideoGen(i);
        // Refresh scene ref after generation
        const freshScene = state.activeProject.scenes[i];
        if (freshScene.videoStatus !== 'completed') {
          throw new Error(`Video generation failed for Scene ${i + 1}`);
        }
      } else {
        logConsole(`Scene ${i + 1}: Video already generated. Skipping.`, 'info');
      }
    }

    logConsole('All scenes generated successfully! Starting video compilation...', 'success');
    await compileVideo();
    logConsole('Batch processing completed!', 'success');

  } catch (e) {
    logConsole(`Batch generation failed: ${e.message}`, 'error');
    alert(`Batch generation stopped: ${e.message}`);
  } finally {
    btnBatchGenerate.disabled = false;
    btnBatchGenerate.innerText = '⚡ Batch Generate All';
  }
}

// --- Rendering Functions ---

function renderProjectSelector() {
  // Clear other than first option
  projectSelector.innerHTML = '<option value="">-- Select Project --</option>';
  state.projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.innerText = `${p.title} (${p.aspectRatio})`;
    projectSelector.appendChild(opt);
  });
}

function renderVoiceSelector() {
  voiceSelect.innerHTML = '';
  state.voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.ShortName;
    opt.innerText = v.FriendlyName;
    if (v.ShortName === 'en-US-GuyNeural') opt.selected = true; // default
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

    const ratioClass = state.activeProject.aspectRatio === '9:16' ? 'preview-9-16' : 'preview-16-9';

    // Build the visual card content
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
      <div class="scene-actions">
        <!-- Voice Status -->
        <span class="status-indicator voice-status ${scene.voiceoverStatus || 'pending'}">
          ${scene.voiceoverStatus === 'completed' ? 'Voice Ready' : scene.voiceoverStatus === 'generating' ? 'Generating Voice' : 'Voice Pending'}
        </span>
        <button class="btn btn-secondary btn-sm btn-voice-gen">🗣️ Generate Voice</button>

        <!-- Video Preview -->
        <div class="scene-preview-box ${ratioClass}">
          ${scene.videoUrl ? `<video src="${scene.videoUrl}" autoplay loop muted controls></video>` : '<span class="placeholder">Video not generated</span>'}
        </div>
        
        <!-- Video Status -->
        <span class="status-indicator video-status ${scene.videoStatus || 'pending'}">
          ${scene.videoStatus === 'completed' ? 'Video Ready' : scene.videoStatus === 'generating' ? 'Generating Video' : 'Video Pending'}
        </span>
        <button class="btn btn-primary btn-sm btn-video-gen">📹 Generate Video</button>
      </div>
    `;

    // Event listner for prompt auto-save on change
    const promptInput = card.querySelector('.scene-prompt-input');
    promptInput.addEventListener('change', () => {
      updateSceneDetails(index, { prompt: promptInput.value.trim() });
    });

    // Generate actions listeners
    card.querySelector('.btn-voice-gen').addEventListener('click', () => triggerVoiceGen(index));
    card.querySelector('.btn-video-gen').addEventListener('click', () => triggerVideoGen(index));

    sceneListContainer.appendChild(card);
  });

  // Load compiled output if already available
  if (state.activeProject.compiledVideoUrl) {
    const ratioClass = state.activeProject.aspectRatio === '9:16' ? 'shorts-ratio' : 'wide-ratio';
    finalVideoWrapper.className = `video-preview-wrapper ${ratioClass}`;
    finalVideoWrapper.innerHTML = `<video src="${state.activeProject.compiledVideoUrl}" controls style="width:100%;height:100%;"></video>`;
  } else {
    finalVideoWrapper.className = 'video-preview-wrapper';
    finalVideoWrapper.innerHTML = `<div class="video-placeholder"><span>No render compiled yet</span></div>`;
  }
}

// --- Event Listeners ---

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

// Project Selector
projectSelector.addEventListener('change', (e) => {
  selectProject(e.target.value);
});

// Update settings
btnSaveProjectSettings.addEventListener('click', saveProjectSettings);

// Project modal triggers
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

// Script actions
btnParseScript.addEventListener('click', parseScript);

// Compile actions
btnCompileVideo.addEventListener('click', compileVideo);

// Batch actions
btnBatchGenerate.addEventListener('click', batchGenerateAll);

// Character Reference Image upload actions
btnCharUpload.addEventListener('click', () => {
  charImageInput.click();
});

charImageInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    uploadCharacterImage(e.target.files[0]);
  }
});

btnCharRemove.addEventListener('click', removeCharacterImage);

// App initialization
window.addEventListener('DOMContentLoaded', async () => {
  loadSavedKeys();
  await fetchVoices();
  await fetchProjects();
  logConsole('Welcome to AI Video Content Studio. System initialized successfully!', 'system');
});
