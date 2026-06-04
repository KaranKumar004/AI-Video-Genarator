const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Root directory for projects
const PROJECTS_DIR = path.join(__dirname, 'projects');
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Global project index file
const PROJECT_INDEX_FILE = path.join(PROJECTS_DIR, 'projects.json');
function getProjectsList() {
  if (!fs.existsSync(PROJECT_INDEX_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(PROJECT_INDEX_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveProjectsList(list) {
  fs.writeFileSync(PROJECT_INDEX_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// Helper to download files
async function downloadFile(url, destPath) {
  const file = fs.createWriteStream(destPath);
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect (e.g. standard http to https or cloud redirects)
        const redirectUrl = response.headers.location;
        if (redirectUrl.startsWith('https')) {
          const https = require('https');
          https.get(redirectUrl, (res2) => {
            res2.pipe(file);
            file.on('finish', () => {
              file.close(resolve);
            });
          }).on('error', (err) => {
            fs.unlink(destPath, () => reject(err));
          });
        } else {
          http.get(redirectUrl, (res2) => {
            res2.pipe(file);
            file.on('finish', () => {
              file.close(resolve);
            });
          }).on('error', (err) => {
            fs.unlink(destPath, () => reject(err));
          });
        }
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }
    }).on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

// Helper to download files over HTTPS
async function downloadFileHttps(url, destPath) {
  const https = require('https');
  const file = fs.createWriteStream(destPath);
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        const client = redirectUrl.startsWith('https') ? https : http;
        client.get(redirectUrl, (res2) => {
          res2.pipe(file);
          file.on('finish', () => {
            file.close(resolve);
          });
        }).on('error', (err) => {
          fs.unlink(destPath, () => reject(err));
        });
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }
    }).on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

// Get list of voices
app.get('/api/voices', (req, res) => {
  const pythonCmd = 'python';
  const args = [path.join(__dirname, 'tts_helper.py'), '--list'];
  
  exec(`${pythonCmd} "${args[0]}" --list`, (error, stdout, stderr) => {
    if (error) {
      console.error('Error fetching voices:', error);
      // Return default list if python script fails
      return res.json([
        { "ShortName": "en-US-GuyNeural", "FriendlyName": "Microsoft Guy Online (Male)", "Gender": "Male" },
        { "ShortName": "en-US-JennyNeural", "FriendlyName": "Microsoft Jenny Online (Female)", "Gender": "Female" },
        { "ShortName": "en-GB-SoniaNeural", "FriendlyName": "Microsoft Sonia Online (Female)", "Gender": "Female" },
        { "ShortName": "en-GB-RyanNeural", "FriendlyName": "Microsoft Ryan Online (Male)", "Gender": "Male" }
      ]);
    }
    try {
      const voices = JSON.parse(stdout);
      res.json(voices);
    } catch (e) {
      res.json([
        { "ShortName": "en-US-GuyNeural", "FriendlyName": "Microsoft Guy Online (Male)", "Gender": "Male" },
        { "ShortName": "en-US-JennyNeural", "FriendlyName": "Microsoft Jenny Online (Female)", "Gender": "Female" }
      ]);
    }
  });
});

// Get all projects
app.get('/api/projects', (req, res) => {
  res.json(getProjectsList());
});

// Create new project
app.post('/api/projects', (req, res) => {
  const { title, aspectRatio } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const projectId = 'project_' + Date.now();
  const projectDir = path.join(PROJECTS_DIR, projectId);
  const assetsDir = path.join(projectDir, 'assets');
  
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  const projectData = {
    id: projectId,
    title,
    aspectRatio: aspectRatio || '9:16', // default to Shorts
    script: '',
    bgMusic: '',
    scenes: [],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(projectData, null, 2), 'utf8');

  // Update global list
  const list = getProjectsList();
  list.unshift({
    id: projectId,
    title,
    aspectRatio: projectData.aspectRatio,
    createdAt: projectData.createdAt
  });
  saveProjectsList(list);

  res.json(projectData);
});

// Get a single project
app.get('/api/projects/:id', (req, res) => {
  const projectDir = path.join(PROJECTS_DIR, req.params.id);
  const file = path.join(projectDir, 'project.json');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read project data' });
  }
});

// Upload character reference image for a project
app.post('/api/projects/:id/upload-character-image', (req, res) => {
  const { id } = req.params;
  const { image } = req.body; // base64 Data URL
  const projectDir = path.join(PROJECTS_DIR, id);
  const file = path.join(projectDir, 'project.json');

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    // Parse base64 image
    const matches = image.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid image format' });
    }

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    
    const filename = `character_reference.${ext}`;
    const outputPath = path.join(projectDir, 'assets', filename);
    fs.writeFileSync(outputPath, buffer);

    data.characterImageUrl = `/projects/${id}/assets/${filename}?t=${Date.now()}`;
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

    res.json({ success: true, project: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to upload character image', details: e.message });
  }
});

// Remove character reference image for a project
app.post('/api/projects/:id/remove-character-image', (req, res) => {
  const { id } = req.params;
  const projectDir = path.join(PROJECTS_DIR, id);
  const file = path.join(projectDir, 'project.json');

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    
    // Scan and delete character reference file if exists
    const assetsDir = path.join(projectDir, 'assets');
    const files = fs.readdirSync(assetsDir);
    files.forEach(f => {
      if (f.startsWith('character_reference.')) {
        try {
          fs.unlinkSync(path.join(assetsDir, f));
        } catch (e) {
          // ignore
        }
      }
    });

    data.characterImageUrl = '';
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

    res.json({ success: true, project: data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to remove character image', details: e.message });
  }
});

// Expose static access to project asset files
app.use('/projects/:id/assets', (req, res, next) => {
  const assetPath = path.join(PROJECTS_DIR, req.params.id, 'assets', req.path);
  if (fs.existsSync(assetPath)) {
    res.sendFile(assetPath);
  } else {
    res.status(404).send('Asset not found');
  }
});

// Update project configuration
app.put('/api/projects/:id', (req, res) => {
  const projectDir = path.join(PROJECTS_DIR, req.params.id);
  const file = path.join(projectDir, 'project.json');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const updatedData = { ...data, ...req.body, id: data.id }; // secure ID remains same
    fs.writeFileSync(file, JSON.stringify(updatedData, null, 2), 'utf8');
    
    // Update list too
    const list = getProjectsList();
    const idx = list.findIndex(p => p.id === data.id);
    if (idx !== -1) {
      list[idx].title = updatedData.title;
      list[idx].aspectRatio = updatedData.aspectRatio;
      saveProjectsList(list);
    }

    res.json(updatedData);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Parse Script into Storyboard Scenes
app.post('/api/projects/:id/parse-script', (req, res) => {
  const projectDir = path.join(PROJECTS_DIR, req.params.id);
  const file = path.join(projectDir, 'project.json');
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const script = req.body.script || data.script;

    if (!script.trim()) {
      return res.status(400).json({ error: 'Script text is empty' });
    }

    // Split script by newlines first to group paragraphs/lines, then by sentences within lines
    const lines = script.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const sentences = [];
    
    for (const line of lines) {
      // Split each line by sentence boundaries (periods, exclamation, question marks)
      const sentenceRegex = /[^.!?\s][^.!?]*(?:[.!?](?=\s|$)|(?=$))/g;
      const matches = line.match(sentenceRegex) || [line];
      for (const m of matches) {
        const trimmed = m.trim();
        if (trimmed.length > 3) {
          // Clean up prefix patterns like "Scene 1:", "Scene 01:", "Scene 1 -", "1." at the beginning
          const cleanText = trimmed.replace(/^(?:Scene\s*\d+\s*[:\-\u2013\u2014]\s*|\d+\.\s*)/i, '').trim();
          if (cleanText.length > 3) {
            sentences.push(cleanText);
          } else if (trimmed.length > 3) {
            sentences.push(trimmed);
          }
        }
      }
    }

    // Save existing scenes to preserve assets if text is identical
    const oldScenes = data.scenes || [];
    const scenes = sentences.map((sentence, idx) => {
      // Look for match in existing storyboard to avoid re-generating
      const match = oldScenes.find(o => o.text === sentence);
      if (match) {
        return {
          ...match,
          index: idx
        };
      }
      return {
        index: idx,
        text: sentence,
        prompt: `Cinematic footage of ${sentence.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"")}, highly detailed, 4k, photorealistic`,
        voiceUrl: '',
        videoUrl: '',
        duration: 0,
        voiceoverStatus: 'pending',
        videoStatus: 'pending'
      };
    });

    data.script = script;
    data.scenes = scenes;
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to parse script' });
  }
});

// Generate Voice for a scene
app.post('/api/projects/:id/scenes/:index/generate-voice', (req, res) => {
  const { id, index } = req.params;
  const { voice } = req.body;
  const projectDir = path.join(PROJECTS_DIR, id);
  const file = path.join(projectDir, 'project.json');

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const idx = parseInt(index);
    if (isNaN(idx) || !data.scenes[idx]) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    const scene = data.scenes[idx];
    const outputFilename = `scene_${idx}_audio.mp3`;
    const outputPath = path.join(projectDir, 'assets', outputFilename);
    const selectedVoice = voice || 'en-US-GuyNeural';

    console.log(`Generating voice for Scene ${idx} using ${selectedVoice}...`);

    const pythonCmd = 'python';
    const args = [
      path.join(__dirname, 'tts_helper.py'),
      '--text', scene.text,
      '--voice', selectedVoice,
      '--output', outputPath
    ];

    const child = spawn(pythonCmd, args);
    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (d) => {
      stdoutData += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderrData += d.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`TTS process exited with code ${code}. Error: ${stderrData}`);
        return res.status(500).json({ error: 'TTS generation failed', details: stderrData });
      }

      // Check duration of generated audio using ffprobe
      const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
      exec(ffprobeCmd, (ffError, ffStdout) => {
        let duration = 3.0; // fallback default
        if (!ffError) {
          duration = parseFloat(ffStdout.trim());
        }

        scene.voiceUrl = `/projects/${id}/assets/${outputFilename}?t=${Date.now()}`;
        scene.duration = duration;
        scene.voiceoverStatus = 'completed';

        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
        res.json({ success: true, scene });
      });
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate Video for a scene (via ComfyUI, Fal.ai, or Replicate)
app.post('/api/projects/:id/scenes/:index/generate-video', async (req, res) => {
  const { id, index } = req.params;
  const { provider, comfyUrl, falKey, replicateKey, modelConfig, customPrompt } = req.body;
  const projectDir = path.join(PROJECTS_DIR, id);
  const file = path.join(projectDir, 'project.json');

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const idx = parseInt(index);
    if (isNaN(idx) || !data.scenes[idx]) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    const scene = data.scenes[idx];
    const promptText = customPrompt || scene.prompt;
    const outputFilename = `scene_${idx}_video.mp4`;
    const outputPath = path.join(projectDir, 'assets', outputFilename);

    console.log(`Generating video for Scene ${idx} via provider [${provider}]...`);

    if (provider === 'comfyui') {
      if (!comfyUrl) {
        return res.status(400).json({ error: 'ComfyUI URL is required' });
      }
      
      // Clean base url (remove trailing slash) and ensure protocol is present
      let baseUrl = comfyUrl.replace(/\/$/, '').trim();
      if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        baseUrl = 'https://' + baseUrl;
      }

      // Check if project has character reference image and upload it to ComfyUI first
      let comfyImageName = '';
      try {
        const assetsDir = path.join(projectDir, 'assets');
        if (fs.existsSync(assetsDir)) {
          const files = fs.readdirSync(assetsDir);
          const charFile = files.find(f => f.startsWith('character_reference.'));
          if (charFile) {
            const localImagePath = path.join(assetsDir, charFile);
            console.log(`Uploading character reference image ${charFile} to ComfyUI...`);
            
            const fileBuffer = fs.readFileSync(localImagePath);
            const fileExt = charFile.split('.').pop();
            const fileBlob = new Blob([fileBuffer], { type: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}` });
            const formData = new FormData();
            formData.append('image', fileBlob, charFile);
            formData.append('overwrite', 'true');

            const uploadRes = await fetch(`${baseUrl}/upload/image`, {
              method: 'POST',
              body: formData,
              signal: AbortSignal.timeout(15000)
            });

            if (uploadRes.ok) {
              const uploadJson = await uploadRes.json();
              comfyImageName = uploadJson.name;
              console.log(`Uploaded character image successfully to ComfyUI input: ${comfyImageName}`);
            } else {
              console.warn(`ComfyUI image upload returned status code ${uploadRes.status}`);
            }
          }
        }
      } catch (uploadErr) {
        console.error('Failed to upload character reference image to ComfyUI:', uploadErr.message);
      }

      // Load prompt workflow template
      const workflowPath = path.join(__dirname, 'workflows', 'svd_api.json');
      let workflowJson;
      if (fs.existsSync(workflowPath)) {
        workflowJson = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      } else {
        // Fallback simple SVD JSON representation
        workflowJson = {
          "3": {
            "class_type": "KSampler",
            "inputs": { "cfg": 2.5, "denoise": 1, "latent_image": ["12", 0], "model": ["14", 0], "noise_seed": Math.floor(Math.random() * 1000000), "positive": ["15", 0], "sampler_name": "euler", "scheduler": "karras", "steps": 20 }
          },
          "12": {
            "class_type": "SVD_img2vid_Conditioning",
            "inputs": { "width": data.aspectRatio === '9:16' ? 576 : 1024, "height": data.aspectRatio === '9:16' ? 1024 : 576, "video_frames": 25, "motion_bucket_id": 127, "fps": 6, "augmentation_level": 0.0, "clip_vision": ["15", 1], "init_image": ["15", 2] }
          },
          "14": {
            "class_type": "ImageOnlyCheckpointLoader",
            "inputs": { "ckpt_name": "svd_xt.safetensors" }
          },
          "15": {
            "class_type": "CLIPTextEncode",
            "inputs": { "text": promptText, "clip": ["14", 1] }
          },
          "20": {
            "class_type": "VHS_VideoCombine",
            "inputs": { "images": ["3", 0], "frame_rate": 8, "loop_count": 0, "filename_prefix": "AI_Studio", "format": "video/h264-mp4" }
          }
        };
      }

      // 1. Randomize seed in any KSampler nodes
      for (const nodeId in workflowJson) {
        const node = workflowJson[nodeId];
        if ((node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') && node.inputs) {
          node.inputs.seed = Math.floor(Math.random() * 1000000000);
        }
      }

      // 2. Adjust resolution in any EmptyLatentImage nodes
      for (const nodeId in workflowJson) {
        const node = workflowJson[nodeId];
        if (node.class_type === 'EmptyLatentImage' && node.inputs) {
          node.inputs.width = data.aspectRatio === '9:16' ? 432 : 768;
          node.inputs.height = data.aspectRatio === '9:16' ? 768 : 432;
        }
      }

      // 3. Set positive prompt text by tracing KSampler inputs
      let promptInjected = false;
      for (const nodeId in workflowJson) {
        const node = workflowJson[nodeId];
        if (node.class_type === 'KSampler' && node.inputs && node.inputs.positive) {
          const positiveLink = node.inputs.positive;
          if (Array.isArray(positiveLink) && positiveLink[0]) {
            const posNodeId = positiveLink[0];
            const posNode = workflowJson[posNodeId];
            if (posNode && posNode.inputs && 'text' in posNode.inputs) {
              posNode.inputs.text = `masterpiece, best quality, 8k, ultra detailed, ${promptText}, smooth motion, professional cinematography, cinematic lighting`;
              promptInjected = true;
              console.log(`Injected positive prompt into node ID: ${posNodeId}`);
              break;
            }
          }
        }
      }

      // Fallback: If not injected, look for node "4" specifically (since it is the positive CLIPTextEncode in our template)
      if (!promptInjected && workflowJson["4"] && workflowJson["4"].inputs) {
        workflowJson["4"].inputs.text = `masterpiece, best quality, 8k, ultra detailed, ${promptText}, smooth motion, professional cinematography, cinematic lighting`;
        promptInjected = true;
      }

      // Hard fallback: just replace first CLIPTextEncode
      if (!promptInjected) {
        for (const nodeId in workflowJson) {
          const node = workflowJson[nodeId];
          if (node.class_type === 'CLIPTextEncode' && node.inputs && 'text' in node.inputs) {
            node.inputs.text = promptText;
            break;
          }
        }
      }

      // 4. Inject LoadImage + VAEEncode + RepeatLatentBatch if character reference image is uploaded
      if (comfyImageName) {
        console.log(`Rewiring ComfyUI workflow for character consistency using image: ${comfyImageName}`);
        
        workflowJson["98"] = {
          "class_type": "LoadImage",
          "inputs": {
            "image": comfyImageName,
            "upload": "image"
          }
        };

        workflowJson["99"] = {
          "class_type": "VAEEncode",
          "inputs": {
            "pixels": ["98", 0],
            "vae": ["1", 2]
          }
        };

        workflowJson["100"] = {
          "class_type": "RepeatLatentBatch",
          "inputs": {
            "samples": ["99", 0],
            "amount": 16
          }
        };

        // Find KSampler nodes and rewire them to use the new VAEEncode latent and a reduced denoise
        for (const nodeId in workflowJson) {
          const node = workflowJson[nodeId];
          if ((node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') && node.inputs) {
            node.inputs.latent_image = ["100", 0];
            node.inputs.denoise = 0.70; // 0.70 denoise keeps the composition/character structure consistent!
            console.log(`Rewired KSampler node ID ${nodeId} to use character image with denoise 0.70.`);
          }
        }
      }

      // Send prompt to ComfyUI
      const response = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflowJson }),
        signal: AbortSignal.timeout(15000) // 15s timeout
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ComfyUI HTTP Error: ${response.status} - ${errText}`);
      }

      const resJson = await response.json();
      const promptId = resJson.prompt_id;
      console.log(`ComfyUI Prompt queued. Prompt ID: ${promptId}`);

      // Poll history endpoint for completion
      let finished = false;
      let attempts = 0;
      const maxAttempts = 720; // 60 minutes total (5s intervals)
      let videoFilename = '';
      
      while (!finished && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        
        console.log(`Polling ComfyUI prompt status (attempt ${attempts}/${maxAttempts})...`);
        
        try {
          const histRes = await fetch(`${baseUrl}/history/${promptId}`, {
            signal: AbortSignal.timeout(10000) // 10s timeout
          });
          if (histRes.ok) {
            const histJson = await histRes.json();
            if (histJson[promptId]) {
              finished = true;
              console.log(`ComfyUI prompt ${promptId} finished! Parsing output...`);
              
              const outputs = histJson[promptId].outputs;
              // Scan output nodes for videos/gifs
              for (const nodeId in outputs) {
                const nodeOutput = outputs[nodeId];
                const files = nodeOutput.gifs || nodeOutput.videos || nodeOutput.images || [];
                const matchedFile = files.find(f => f.filename.endsWith('.mp4') || f.filename.endsWith('.gif') || f.filename.endsWith('.webm'));
                if (matchedFile) {
                  videoFilename = matchedFile.filename;
                  break;
                }
              }
            }
          }
        } catch (pollErr) {
          console.warn(`Polling attempt ${attempts} encountered a network error: ${pollErr.message}. Retrying...`);
        }
      }

      if (!videoFilename) {
        throw new Error('ComfyUI execution timed out or did not return a valid video output.');
      }

      // Download file from ComfyUI
      const fileUrl = `${baseUrl}/view?filename=${encodeURIComponent(videoFilename)}&type=output`;
      console.log(`Downloading video output from ${fileUrl}...`);
      
      // Select standard HTTP or HTTPS downloader based on ComfyUI tunnel
      const downloader = fileUrl.startsWith('https') ? downloadFileHttps : downloadFile;
      await downloader(fileUrl, outputPath);
      
      scene.videoUrl = `/projects/${id}/assets/${outputFilename}?t=${Date.now()}`;
      scene.videoStatus = 'completed';
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

      return res.json({ success: true, scene });

    } else if (provider === 'fal') {
      if (!falKey) {
        return res.status(400).json({ error: 'Fal.ai API key is required' });
      }

      const model = modelConfig || 'fal-ai/hunyuan-video'; // default
      console.log(`Calling Fal.ai queue for model: ${model}`);

      const response = await fetch(`https://queue.fal.run/${model}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${falKey}`
        },
        body: JSON.stringify({
          prompt: promptText,
          aspect_ratio: data.aspectRatio === '9:16' ? '9:16' : '16:9',
          num_frames: 61, // ~6 seconds at 10fps
          fps: 10
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Fal.ai HTTP Error: ${response.status} - ${errText}`);
      }

      const { request_id } = await response.json();
      console.log(`Fal.ai queued. Request ID: ${request_id}`);

      let completed = false;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes
      let videoUrl = '';

      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

        const checkRes = await fetch(`https://queue.fal.run/${model}/requests/${request_id}`, {
          headers: { 'Authorization': `Key ${falKey}` }
        });

        if (checkRes.ok) {
          const statusJson = await checkRes.json();
          if (statusJson.status === 'COMPLETED') {
            completed = true;
            videoUrl = statusJson.video?.url || statusJson.outputs?.video?.url || (statusJson.images && statusJson.images[0]?.url);
          } else if (statusJson.status === 'FAILED') {
            throw new Error(`Fal.ai job failed: ${statusJson.error || 'Unknown error'}`);
          }
        }
      }

      if (!videoUrl) {
        throw new Error('Fal.ai execution timed out or did not return a video URL.');
      }

      console.log(`Downloading video output from Fal.ai: ${videoUrl}`);
      const downloader = videoUrl.startsWith('https') ? downloadFileHttps : downloadFile;
      await downloader(videoUrl, outputPath);

      scene.videoUrl = `/projects/${id}/assets/${outputFilename}?t=${Date.now()}`;
      scene.videoStatus = 'completed';
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

      return res.json({ success: true, scene });

    } else if (provider === 'replicate') {
      if (!replicateKey) {
        return res.status(400).json({ error: 'Replicate API token is required' });
      }

      // Default to Hunyuan Video or Stable Video Diffusion
      const model = modelConfig || 'lucataco/hunyuan-video:855f4124'; // default version tag
      const [modelOwner, modelNameAndVer] = model.split('/');
      const [modelName, versionHash] = modelNameAndVer.split(':');

      console.log(`Calling Replicate API for model: ${modelOwner}/${modelName}`);

      const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${replicateKey}`
        },
        body: JSON.stringify({
          version: versionHash,
          input: {
            prompt: promptText,
            aspect_ratio: data.aspectRatio === '9:16' ? '9:16' : '16:9',
            steps: 20
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Replicate HTTP Error: ${response.status} - ${errText}`);
      }

      const prediction = await response.json();
      const predictionId = prediction.id;
      console.log(`Replicate prediction queued. ID: ${predictionId}`);

      let completed = false;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes
      let videoUrl = '';

      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;

        const checkRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: { 'Authorization': `Token ${replicateKey}` }
        });

        if (checkRes.ok) {
          const statusJson = await checkRes.json();
          if (statusJson.status === 'succeeded') {
            completed = true;
            // Output is typically a URL string or array containing the URL string
            videoUrl = Array.isArray(statusJson.output) ? statusJson.output[0] : statusJson.output;
          } else if (statusJson.status === 'failed') {
            throw new Error(`Replicate job failed: ${statusJson.error || 'Unknown error'}`);
          }
        }
      }

      if (!videoUrl) {
        throw new Error('Replicate execution timed out or did not return output.');
      }

      console.log(`Downloading video output from Replicate: ${videoUrl}`);
      const downloader = videoUrl.startsWith('https') ? downloadFileHttps : downloadFile;
      await downloader(videoUrl, outputPath);

      scene.videoUrl = `/projects/${id}/assets/${outputFilename}?t=${Date.now()}`;
      scene.videoStatus = 'completed';
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

      return res.json({ success: true, scene });

    } else {
      return res.status(400).json({ error: 'Unsupported video provider' });
    }

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Video generation failed', details: e.message });
  }
});

// Compile project using FFmpeg
app.post('/api/projects/:id/compile', async (req, res) => {
  const { id } = req.params;
  const { bgMusic, bgVolume } = req.body;
  const projectDir = path.join(PROJECTS_DIR, id);
  const file = path.join(projectDir, 'project.json');

  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const scenes = data.scenes || [];
    
    if (scenes.length === 0) {
      return res.status(400).json({ error: 'No scenes to compile' });
    }

    // Verify all scenes have audio and video
    const missingAssets = [];
    scenes.forEach((s, idx) => {
      const audioPath = path.join(projectDir, 'assets', `scene_${idx}_audio.mp3`);
      const videoPath = path.join(projectDir, 'assets', `scene_${idx}_video.mp4`);
      
      if (!fs.existsSync(audioPath)) missingAssets.push(`Scene ${idx} voiceover`);
      if (!fs.existsSync(videoPath)) missingAssets.push(`Scene ${idx} video`);
    });

    if (missingAssets.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required assets for compilation', 
        details: missingAssets 
      });
    }

    console.log(`Starting video compilation for Project: ${data.title}...`);

    // Resolution configuration
    const width = data.aspectRatio === '9:16' ? 1080 : 1920;
    const height = data.aspectRatio === '9:16' ? 1920 : 1080;
    
    // Stage 1: Render each combined scene clip scaled to correct size and looping/shortest audio length
    const combinedClipsList = [];
    
    for (let idx = 0; idx < scenes.length; idx++) {
      const scene = scenes[idx];
      const audioPath = path.join(projectDir, 'assets', `scene_${idx}_audio.mp3`);
      const videoPath = path.join(projectDir, 'assets', `scene_${idx}_video.mp4`);
      const sceneCombinedPath = path.join(projectDir, 'assets', `scene_${idx}_combined.mp4`);
      
      combinedClipsList.push(sceneCombinedPath);

      // crop-to-fill scaling filter
      const scaleFilter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[v]`;
      
      const compileSceneCmd = `ffmpeg -y -stream_loop -1 -i "${videoPath}" -i "${audioPath}" -filter_complex "${scaleFilter}" -map "[v]" -map 1:a -c:v libx264 -c:a aac -shortest -pix_fmt yuv420p -r 30 "${sceneCombinedPath}"`;
      
      console.log(`Compiling Scene ${idx}: running FFmpeg...`);
      await new Promise((resolve, reject) => {
        exec(compileSceneCmd, (error, stdout, stderr) => {
          if (error) {
            console.error(`FFmpeg Scene ${idx} error:`, stderr);
            reject(new Error(`Failed to compile scene ${idx}: ${stderr}`));
          } else {
            resolve();
          }
        });
      });
    }

    // Stage 2: Concatenate all combined clips together using FFmpeg concat demuxer
    const listTxtPath = path.join(projectDir, 'assets', 'file_list.txt');
    const concatContent = combinedClipsList.map(p => `file '${path.basename(p)}'`).join('\n');
    fs.writeFileSync(listTxtPath, concatContent, 'utf8');

    const concatOutputPath = path.join(projectDir, 'assets', 'concatenated.mp4');
    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${listTxtPath}" -c copy "${concatOutputPath}"`;

    console.log('Concatenating scenes together...');
    await new Promise((resolve, reject) => {
      exec(concatCmd, (error, stdout, stderr) => {
        if (error) {
          console.error('Concat error:', stderr);
          reject(new Error(`Concat error: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    // Stage 3: Mix background music (optional)
    const finalOutputPath = path.join(projectDir, 'assets', 'final_output.mp4');
    let finalCmd = '';
    
    // Check if background music is specified and exists
    let bgMusicPath = '';
    if (bgMusic) {
      // bgMusic is either an uploaded file or path
      bgMusicPath = path.isAbsolute(bgMusic) ? bgMusic : path.join(projectDir, 'assets', bgMusic);
    }

    if (bgMusicPath && fs.existsSync(bgMusicPath)) {
      const vol = bgVolume || 0.08;
      console.log(`Adding background music: ${bgMusicPath} with volume ${vol}...`);
      
      finalCmd = `ffmpeg -y -i "${concatOutputPath}" -stream_loop -1 -i "${bgMusicPath}" -filter_complex "[0:a]volume=1.0[a1];[1:a]volume=${vol}[a2];[a1][a2]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac "${finalOutputPath}"`;
    } else {
      console.log('No background music found. Copying concatenated file as final output...');
      finalCmd = `ffmpeg -y -i "${concatOutputPath}" -c copy "${finalOutputPath}"`;
    }

    await new Promise((resolve, reject) => {
      exec(finalCmd, (error, stdout, stderr) => {
        if (error) {
          console.error('Final mixing error:', stderr);
          reject(new Error(`Final mixing error: ${stderr}`));
        } else {
          resolve();
        }
      });
    });

    // Clean up intermediate files to save disk space
    try {
      if (fs.existsSync(listTxtPath)) fs.unlinkSync(listTxtPath);
      if (fs.existsSync(concatOutputPath)) fs.unlinkSync(concatOutputPath);
      combinedClipsList.forEach(p => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
    } catch (cleanErr) {
      console.warn('Error during cleanup:', cleanErr);
    }

    console.log('Video compilation completed successfully!');
    
    // Save output details in project.json
    data.bgMusic = bgMusic || '';
    data.compiledVideoUrl = `/projects/${id}/assets/final_output.mp4?t=${Date.now()}`;
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

    res.json({ 
      success: true, 
      videoUrl: data.compiledVideoUrl
    });

  } catch (e) {
    console.error('Compilation failed:', e);
    res.status(500).json({ error: 'Video compilation failed', details: e.message });
  }
});

// Launch server
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`  AI Video Content Studio is now running!`);
  console.log(`  Local Address: http://localhost:${PORT}`);
  console.log(`=================================================`);
});
