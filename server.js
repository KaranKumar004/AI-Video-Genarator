const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ffmpegPath = require('ffmpeg-static');
const ffprobe = require('@ffprobe-installer/ffprobe');
const ffprobePath = ffprobe.path;
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ai-video-studio-super-secret-key-12345';

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

// Global compile jobs mapping
const compileJobs = {};

// Helper to download files
async function downloadFile(url, destPath) {
  const file = fs.createWriteStream(destPath);
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
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

// Middleware to authenticate JWT tokens
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.userId = user.userId;
    req.userEmail = user.email;
    next();
  });
}

// --- AUTHENTICATION ROUTES ---

app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Email format checker
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  try {
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await db.createUser(email, passwordHash);
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Sign up failed', details: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Log in failed', details: e.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    res.json({
      success: true,
      user: { 
        id: req.userId, 
        email: req.userEmail,
        isPro: user ? (user.isPro || user.email.toLowerCase() === 'karankumarsk14@gmail.com') : false
      }
    });
  } catch (e) {
    res.json({
      success: true,
      user: { id: req.userId, email: req.userEmail, isPro: false }
    });
  }
});

// --- PAYMENTS & CONFIG ---

app.get('/api/config/razorpay-key', (req, res) => {
  res.json({
    keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key'
  });
});

app.post('/api/payments/upgrade-pro', authenticateToken, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    
    // Verify signature if key secret is present
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (secret && razorpay_order_id && razorpay_signature) {
      const crypto = require('crypto');
      const shasum = crypto.createHmac('sha256', secret);
      shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const digest = shasum.digest('hex');
      if (digest !== razorpay_signature) {
        return res.status(400).json({ error: 'Transaction signature verification failed' });
      }
    }

    console.log(`[payments] Upgrading user ${req.userId} (${req.userEmail}) to PRO. Payment ID: ${razorpay_payment_id}`);
    await db.updateUserProStatus(req.userId, true);
    
    res.json({ success: true, message: 'Successfully upgraded to PRO!' });
  } catch (e) {
    console.error('[payments] Failed to upgrade user:', e);
    res.status(500).json({ error: 'Failed to upgrade to PRO. Please contact support.' });
  }
});

// --- VOICES (PUBLIC) ---
app.get('/api/voices', (req, res) => {
  const pythonCmd = 'python';
  const args = [path.join(__dirname, 'tts_helper.py'), '--list'];
  
  exec(`${pythonCmd} "${args[0]}" --list`, (error, stdout, stderr) => {
    if (error) {
      console.error('Error fetching voices:', error);
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

// --- PROJECTS (AUTHENTICATED) ---

app.get('/api/projects', authenticateToken, async (req, res) => {
  try {
    const list = await db.getProjects(req.userId);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

app.post('/api/projects', authenticateToken, async (req, res) => {
  const { title, aspectRatio } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const newProject = await db.createProject(req.userId, title, aspectRatio || '9:16');
    res.json(newProject);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.get('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const project = await db.getProject(req.params.id, req.userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read project data' });
  }
});

app.post('/api/projects/:id/upload-character-image', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { image } = req.body; // base64 Data URL
  const projectDir = path.join(PROJECTS_DIR, id);

  try {
    const project = await db.getProject(id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

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

    const characterImageUrl = `/projects/${id}/assets/${filename}?t=${Date.now()}`;
    const updated = await db.updateProject(id, req.userId, { characterImageUrl });

    res.json({ success: true, project: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to upload character image', details: e.message });
  }
});

app.post('/api/projects/:id/remove-character-image', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const projectDir = path.join(PROJECTS_DIR, id);

  try {
    const project = await db.getProject(id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Scan and delete character reference file if exists
    const assetsDir = path.join(projectDir, 'assets');
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      files.forEach(f => {
        if (f.startsWith('character_reference.')) {
          try {
            fs.unlinkSync(path.join(assetsDir, f));
          } catch (e) {}
        }
      });
    }

    const updated = await db.updateProject(id, req.userId, { characterImageUrl: '' });
    res.json({ success: true, project: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to remove character image', details: e.message });
  }
});

// Expose static access to project asset files (Requires auth for secure projects)
app.use('/projects/:id/assets', (req, res, next) => {
  const assetPath = path.join(PROJECTS_DIR, req.params.id, 'assets', req.path);
  if (fs.existsSync(assetPath)) {
    res.sendFile(assetPath);
  } else {
    res.status(404).send('Asset not found');
  }
});

app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const updated = await db.updateProject(req.params.id, req.userId, req.body);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update project', details: e.message });
  }
});

app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    await db.deleteProject(req.params.id, req.userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete project', details: e.message });
  }
});

app.post('/api/projects/:id/parse-script', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    const project = await db.getProject(id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const script = req.body.script || project.script;
    if (!script.trim()) {
      return res.status(400).json({ error: 'Script text is empty' });
    }

    const lines = script.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const sentences = [];
    
    for (const line of lines) {
      const sentenceRegex = /[^.!?\s][^.!?]*(?:[.!?](?=\s|$)|(?=$))/g;
      const matches = line.match(sentenceRegex) || [line];
      for (const m of matches) {
        const trimmed = m.trim();
        if (trimmed.length > 3) {
          const cleanText = trimmed.replace(/^(?:Scene\s*\d+\s*[:\-\u2013\u2014]\s*|\d+\.\s*)/i, '').trim();
          if (cleanText.length > 3) {
            sentences.push(cleanText);
          } else if (trimmed.length > 3) {
            sentences.push(trimmed);
          }
        }
      }
    }

    const oldScenes = project.scenes || [];
    const scenes = sentences.map((sentence, idx) => {
      const match = oldScenes.find(o => o.text === sentence);
      if (match) {
        return { ...match, index: idx };
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

    const updated = await db.updateProject(id, req.userId, { script, scenes });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to parse script' });
  }
});

app.post('/api/projects/:id/scenes/:index/generate-voice', authenticateToken, async (req, res) => {
  const { id, index } = req.params;
  const { voice } = req.body;
  const projectDir = path.join(PROJECTS_DIR, id);

  try {
    const project = await db.getProject(id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const idx = parseInt(index);
    if (isNaN(idx) || !project.scenes[idx]) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    const scene = project.scenes[idx];
    const assetsDir = path.join(projectDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    const outputFilename = `scene_${idx}_audio.mp3`;
    const outputPath = path.join(assetsDir, outputFilename);
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

    child.stdout.on('data', (d) => { stdoutData += d.toString(); });
    child.stderr.on('data', (d) => { stderrData += d.toString(); });

    child.on('close', async (code) => {
      if (code !== 0) {
        console.error(`TTS process exited with code ${code}. Error: ${stderrData}`);
        return res.status(500).json({ error: 'TTS generation failed', details: stderrData });
      }

      // Check duration of generated audio using dynamic ffprobePath
      const ffprobeCmd = `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
      exec(ffprobeCmd, async (ffError, ffStdout) => {
        let duration = 3.0; // fallback default
        if (!ffError) {
          duration = parseFloat(ffStdout.trim());
        }

        scene.voiceUrl = `/projects/${id}/assets/${outputFilename}?t=${Date.now()}`;
        scene.duration = duration;
        scene.voiceoverStatus = 'completed';

        await db.updateProject(id, req.userId, { scenes: project.scenes });
        res.json({ success: true, scene });
      });
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- SUBTITLE HELPERS ---

function wrapTextDynamic(text, aspectRatio, width) {
  let maxChars = 25;
  if (aspectRatio === '16:9') {
    maxChars = 45;
  } else if (aspectRatio === '1:1') {
    maxChars = 30;
  } else if (aspectRatio === '4:5') {
    maxChars = 25;
  } else if (aspectRatio === '9:16') {
    maxChars = 20;
  }

  const words = text.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxChars) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function getDrawtextFilters(text, aspectRatio, width, height) {
  const lines = wrapTextDynamic(text, aspectRatio, width);
  if (lines.length === 0) return '';

  const fontSize = Math.round(width * 0.05); // dynamic font size proportional to width
  const borderW = Math.max(2, Math.round(fontSize * 0.08)); // proportional border
  const lineSpacing = Math.round(fontSize * 1.25);
  
  // Center the text block around 75% height
  const baseCenterY = Math.round(height * 0.75);
  const totalHeight = (lines.length - 1) * lineSpacing;
  const startY = baseCenterY - Math.round(totalHeight / 2);

  // Escaping for FFmpeg drawtext
  const escapeFFmpegText = (str) => {
    return str
      .replace(/'/g, "'\\\\\\''")
      .replace(/:/g, '\\:');
  };

  return lines.map((line, idx) => {
    const escapedLine = escapeFFmpegText(line);
    const y = startY + (idx * lineSpacing);
    return `drawtext=text='${escapedLine}':x=(w-text_w)/2:y=${y}:fontsize=${fontSize}:fontcolor=yellow:borderw=${borderW}:bordercolor=black`;
  }).join(',');
}

// --- GENERATE VIDEO FOR SCENE ---
app.post('/api/projects/:id/scenes/:index/generate-video', authenticateToken, async (req, res) => {
  const { id, index } = req.params;
  const { provider, comfyUrl, falKey, replicateKey, modelConfig, customPrompt } = req.body;
  const projectDir = path.join(PROJECTS_DIR, id);

  try {
    const project = await db.getProject(id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const idx = parseInt(index);
    if (isNaN(idx) || !project.scenes[idx]) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    // Check usage limits
    const withinLimits = await db.checkUsageLimit(req.userId, 'video');
    if (!withinLimits) {
      return res.status(429).json({ error: 'Daily video generation limit reached (Max 3/day).' });
    }

    const scene = project.scenes[idx];
    const assetsDir = path.join(projectDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    const promptText = customPrompt || scene.prompt;
    const outputFilename = `scene_${idx}_video.mp4`;
    const outputPath = path.join(assetsDir, outputFilename);

    console.log(`Generating video for Scene ${idx} via provider [${provider}]...`);

    if (provider === 'comfyui') {
      if (!comfyUrl) {
        return res.status(400).json({ error: 'ComfyUI URL is required' });
      }
      
      let baseUrl = comfyUrl.replace(/\/$/, '').trim();
      if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        baseUrl = 'https://' + baseUrl;
      }

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
        workflowJson = {
          "3": {
            "class_type": "KSampler",
            "inputs": { "cfg": 2.5, "denoise": 1, "latent_image": ["12", 0], "model": ["14", 0], "noise_seed": Math.floor(Math.random() * 1000000), "positive": ["15", 0], "sampler_name": "euler", "scheduler": "karras", "steps": 20 }
          },
          "12": {
            "class_type": "SVD_img2vid_Conditioning",
            "inputs": { "width": project.aspectRatio === '9:16' ? 576 : 1024, "height": project.aspectRatio === '9:16' ? 1024 : 576, "video_frames": 25, "motion_bucket_id": 127, "fps": 6, "augmentation_level": 0.0, "clip_vision": ["15", 1], "init_image": ["15", 2] }
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

      for (const nodeId in workflowJson) {
        const node = workflowJson[nodeId];
        if ((node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') && node.inputs) {
          node.inputs.seed = Math.floor(Math.random() * 1000000000);
        }
      }

      for (const nodeId in workflowJson) {
        const node = workflowJson[nodeId];
        if (node.class_type === 'EmptyLatentImage' && node.inputs) {
          node.inputs.width = project.aspectRatio === '9:16' ? 432 : 768;
          node.inputs.height = project.aspectRatio === '9:16' ? 768 : 432;
        }
      }

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
              break;
            }
          }
        }
      }

      if (!promptInjected && workflowJson["4"] && workflowJson["4"].inputs) {
        workflowJson["4"].inputs.text = `masterpiece, best quality, 8k, ultra detailed, ${promptText}, smooth motion, professional cinematography, cinematic lighting`;
        promptInjected = true;
      }

      if (!promptInjected) {
        for (const nodeId in workflowJson) {
          const node = workflowJson[nodeId];
          if (node.class_type === 'CLIPTextEncode' && node.inputs && 'text' in node.inputs) {
            node.inputs.text = promptText;
            break;
          }
        }
      }

      if (comfyImageName) {
        workflowJson["98"] = {
          "class_type": "LoadImage",
          "inputs": { "image": comfyImageName, "upload": "image" }
        };

        workflowJson["99"] = {
          "class_type": "VAEEncode",
          "inputs": { "pixels": ["98", 0], "vae": ["1", 2] }
        };

        workflowJson["100"] = {
          "class_type": "RepeatLatentBatch",
          "inputs": { "samples": ["99", 0], "amount": 16 }
        };

        for (const nodeId in workflowJson) {
          const node = workflowJson[nodeId];
          if ((node.class_type === 'KSampler' || node.class_type === 'KSamplerAdvanced') && node.inputs) {
            node.inputs.latent_image = ["100", 0];
            node.inputs.denoise = 0.70;
          }
        }
      }

      const response = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflowJson }),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ComfyUI HTTP Error: ${response.status} - ${errText}`);
      }

      const resJson = await response.json();
      const promptId = resJson.prompt_id;

      let finished = false;
      let attempts = 0;
      const maxAttempts = 720;
      let videoFilename = '';
      
      while (!finished && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
        
        try {
          const histRes = await fetch(`${baseUrl}/history/${promptId}`, {
            signal: AbortSignal.timeout(10000)
          });
          if (histRes.ok) {
            const histJson = await histRes.json();
            if (histJson[promptId]) {
              finished = true;
              const outputs = histJson[promptId].outputs;
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
          console.warn(`Polling network error: ${pollErr.message}. Retrying...`);
        }
      }

      if (!videoFilename) {
        throw new Error('ComfyUI execution timed out or did not return a valid video output.');
      }

      const fileUrl = `${baseUrl}/view?filename=${encodeURIComponent(videoFilename)}&type=output`;
      const downloader = fileUrl.startsWith('https') ? downloadFileHttps : downloadFile;
      await downloader(fileUrl, outputPath);
      
      scene.videoUrl = `/projects/${id}/assets/${outputFilename}?t=${Date.now()}`;
      scene.videoStatus = 'completed';
      
      await db.updateProject(id, req.userId, { scenes: project.scenes });
      return res.json({ success: true, scene });

    } else if (provider === 'fal') {
      if (!falKey) {
        return res.status(400).json({ error: 'Fal.ai API key is required' });
      }

      const model = modelConfig || 'fal-ai/hunyuan-video';
      console.log(`Calling Fal.ai queue for model: ${model}`);

      const response = await fetch(`https://queue.fal.run/${model}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${falKey}`
        },
        body: JSON.stringify({
          prompt: promptText,
          aspect_ratio: project.aspectRatio === '9:16' ? '9:16' : project.aspectRatio === '16:9' ? '16:9' : '1:1',
          num_frames: 61,
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
      const maxAttempts = 60;
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
      
      await db.updateProject(id, req.userId, { scenes: project.scenes });
      return res.json({ success: true, scene });

    } else if (provider === 'replicate') {
      if (!replicateKey) {
        return res.status(400).json({ error: 'Replicate API token is required' });
      }

      const model = modelConfig || 'lucataco/hunyuan-video:855f4124';
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
            aspect_ratio: project.aspectRatio === '9:16' ? '9:16' : project.aspectRatio === '16:9' ? '16:9' : '1:1',
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
      const maxAttempts = 60;
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
      
      await db.updateProject(id, req.userId, { scenes: project.scenes });
      return res.json({ success: true, scene });

    } else {
      return res.status(400).json({ error: 'Unsupported video provider' });
    }

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Video generation failed', details: e.message });
  }
});

// --- ASYNC COMPILATION QUEUE ---

// Background compile function
async function runBackgroundCompile(id, userId, bgMusic, bgVolume, burnCaptions) {
  const projectDir = path.join(PROJECTS_DIR, id);
  console.log(`[runBackgroundCompile] Starting background compilation for project ID: ${id}, User ID: ${userId}`);
  
  try {
    const data = await db.getProject(id, userId);
    if (!data) {
      console.error(`[runBackgroundCompile] db.getProject returned null/falsy for ID: ${id}, User: ${userId}`);
      throw new Error('Project not found');
    }
    const scenes = data.scenes || [];
    console.log(`[runBackgroundCompile] Project data loaded successfully. Title: "${data.title}", Scenes count: ${scenes.length}`);
    
    // Resolution configuration
    let width = 1080;
    let height = 1920;
    if (data.aspectRatio === '16:9') {
      width = 1920;
      height = 1080;
    } else if (data.aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    } else if (data.aspectRatio === '4:5') {
      width = 1080;
      height = 1350;
    }

    compileJobs[id].totalScenes = scenes.length;
    
    // Stage 1: Render each combined scene clip scaled to correct size and looping/shortest audio length
    const combinedClipsList = [];
    
    for (let idx = 0; idx < scenes.length; idx++) {
      compileJobs[id].currentStep = `Generating Scenes (${idx + 1}/${scenes.length})`;
      
      const scene = scenes[idx];
      const audioPath = path.join(projectDir, 'assets', `scene_${idx}_audio.mp3`);
      const videoPath = path.join(projectDir, 'assets', `scene_${idx}_video.mp4`);
      const sceneCombinedPath = path.join(projectDir, 'assets', `scene_${idx}_combined.mp4`);
      
      combinedClipsList.push(sceneCombinedPath);

      // crop-to-fill scaling filter
      let scaleFilter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[v]`;
      if (burnCaptions) {
        const drawtextFilters = getDrawtextFilters(scene.text, data.aspectRatio, width, height);
        if (drawtextFilters) {
          scaleFilter = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},${drawtextFilters}[v]`;
        }
      }
      
      // OPTIMIZATION: Use -preset superfast to encode quickly on low-CPU servers (e.g. Render)
      const compileSceneCmd = `"${ffmpegPath}" -y -stream_loop -1 -i "${videoPath}" -i "${audioPath}" -filter_complex "${scaleFilter}" -map "[v]" -map 1:a -c:v libx264 -preset superfast -c:a aac -shortest -pix_fmt yuv420p -r 30 "${sceneCombinedPath}"`;
      
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
    compileJobs[id].currentStep = 'Merging Scenes';
    
    const listTxtPath = path.join(projectDir, 'assets', 'file_list.txt');
    const concatContent = combinedClipsList.map(p => `file '${path.basename(p)}'`).join('\n');
    fs.writeFileSync(listTxtPath, concatContent, 'utf8');

    const concatOutputPath = path.join(projectDir, 'assets', 'concatenated.mp4');
    const concatCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${listTxtPath}" -c copy "${concatOutputPath}"`;

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
    compileJobs[id].currentStep = 'Adding Background Music';
    
    const finalOutputPath = path.join(projectDir, 'assets', 'final_output.mp4');
    let finalCmd = '';
    
    let bgMusicPath = '';
    if (bgMusic) {
      bgMusicPath = path.isAbsolute(bgMusic) ? bgMusic : path.join(projectDir, 'assets', bgMusic);
    }

    if (bgMusicPath && fs.existsSync(bgMusicPath)) {
      const vol = bgVolume || 0.08;
      console.log(`Adding background music: ${bgMusicPath} with volume ${vol}...`);
      finalCmd = `"${ffmpegPath}" -y -i "${concatOutputPath}" -stream_loop -1 -i "${bgMusicPath}" -filter_complex "[0:a]volume=1.0[a1];[1:a]volume=${vol}[a2];[a1][a2]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac "${finalOutputPath}"`;
    } else {
      console.log('No background music found. Copying concatenated file as final output...');
      finalCmd = `"${ffmpegPath}" -y -i "${concatOutputPath}" -c copy "${finalOutputPath}"`;
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

    // Clean up intermediate files
    try {
      if (fs.existsSync(listTxtPath)) fs.unlinkSync(listTxtPath);
      if (fs.existsSync(concatOutputPath)) fs.unlinkSync(concatOutputPath);
      combinedClipsList.forEach(p => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      });
    } catch (cleanErr) {
      console.warn('Error during cleanup:', cleanErr);
    }

    console.log('[runBackgroundCompile] Video compilation completed successfully! Calling incrementUsage and updateProject...');
    
    await db.incrementUsage(userId, 'video');

    const compiledVideoUrl = `/projects/${id}/assets/final_output.mp4?t=${Date.now()}`;
    console.log(`[runBackgroundCompile] Updating project compilation video URL to: ${compiledVideoUrl}`);
    await db.updateProject(id, userId, {
      bgMusic: bgMusic || '',
      compiledVideoUrl
    });

    compileJobs[id].status = 'completed';
    compileJobs[id].currentStep = 'Completed';
    compileJobs[id].videoUrl = compiledVideoUrl;
    console.log(`[runBackgroundCompile] Compilation job for project ID ${id} completed successfully.`);

  } catch (err) {
    console.error('[runBackgroundCompile] Compilation failed inside catch block:', err);
    compileJobs[id].status = 'failed';
    compileJobs[id].currentStep = 'Failed';
    compileJobs[id].error = err.message;
  }
}

app.post('/api/projects/:id/compile', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { bgMusic, bgVolume, burnCaptions } = req.body;
  console.log(`[/api/projects/:id/compile] Post request received. Project ID: ${id}, User ID: ${req.userId}`);

  try {
    const project = await db.getProject(id, req.userId);
    if (!project) {
      console.warn(`[/api/projects/:id/compile] Project not found in DB check. ID: ${id}, User: ${req.userId}`);
      return res.status(404).json({ error: 'Project not found' });
    }
    const scenes = project.scenes || [];
    console.log(`[/api/projects/:id/compile] Project found. Scenes count: ${scenes.length}. Checking if assets exist...`);
    
    if (scenes.length === 0) {
      return res.status(400).json({ error: 'No scenes to compile' });
    }

    // Check usage limits
    const withinLimits = await db.checkUsageLimit(req.userId, 'video');
    if (!withinLimits) {
      return res.status(429).json({ error: 'Daily video compilation limit reached (Max 3/day).' });
    }

    // Verify all scenes have audio and video
    const missingAssets = [];
    const projectDir = path.join(PROJECTS_DIR, id);
    scenes.forEach((s, idx) => {
      const audioPath = path.join(projectDir, 'assets', `scene_${idx}_audio.mp3`);
      const videoPath = path.join(projectDir, 'assets', `scene_${idx}_video.mp4`);
      
      if (!fs.existsSync(audioPath)) missingAssets.push(`Scene ${idx + 1} voiceover`);
      if (!fs.existsSync(videoPath)) missingAssets.push(`Scene ${idx + 1} video`);
    });

    if (missingAssets.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required assets for compilation', 
        details: missingAssets 
      });
    }

    if (compileJobs[id] && compileJobs[id].status === 'compiling') {
      return res.status(400).json({ error: 'Compilation is already in progress for this project' });
    }

    compileJobs[id] = {
      status: 'compiling',
      currentStep: 'Initializing',
      totalScenes: scenes.length,
      videoUrl: null,
      error: null
    };

    // Run compile in background
    runBackgroundCompile(id, req.userId, bgMusic, bgVolume, burnCaptions === true);

    res.json({ success: true, status: 'compiling' });

  } catch (e) {
    console.error('Compile initiation failed:', e);
    res.status(500).json({ error: 'Failed to start video compilation' });
  }
});

app.get('/api/projects/:id/compile-status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const job = compileJobs[id];
  if (job) {
    res.json({
      success: true,
      status: job.status,
      currentStep: job.currentStep,
      videoUrl: job.videoUrl,
      error: job.error
    });
  } else {
    try {
      const project = await db.getProject(id, req.userId);
      if (project && project.compiledVideoUrl) {
        res.json({
          success: true,
          status: 'completed',
          currentStep: 'Completed',
          videoUrl: project.compiledVideoUrl,
          error: null
        });
      } else {
        res.json({
          success: true,
          status: 'idle',
          currentStep: 'Idle',
          videoUrl: null,
          error: null
        });
      }
    } catch (e) {
      res.status(500).json({ error: 'Failed to read project compile status' });
    }
  }
});

// --- THUMBNAIL GENERATOR ---
app.post('/api/projects/:id/generate-thumbnail', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { provider, falKey, replicateKey, prompt } = req.body;
  const projectDir = path.join(PROJECTS_DIR, id);
  
  try {
    const project = await db.getProject(id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Check usage limits
    const withinLimits = await db.checkUsageLimit(req.userId, 'thumbnail');
    if (!withinLimits) {
      return res.status(429).json({ error: 'Daily thumbnail generation limit reached (Max 10/day).' });
    }

    const stylePrompt = prompt || `YouTube thumbnail for a video about ${project.title}, vibrant colors, eye catching, 4k`;
    const assetsDir = path.join(projectDir, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    const outputFilename = `thumbnail.jpg`;
    const outputPath = path.join(assetsDir, outputFilename);
    
    let imageUrl = '';

    if (provider === 'fal') {
      if (!falKey) return res.status(400).json({ error: 'Fal.ai key is required' });
      
      console.log(`Generating thumbnail via Fal.ai Flux Schnell...`);
      const falResponse = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${falKey}`
        },
        body: JSON.stringify({
          prompt: stylePrompt,
          image_size: project.aspectRatio === '16:9' ? 'landscape_16_9' : project.aspectRatio === '9:16' ? 'portrait_9_16' : 'square'
        })
      });

      if (!falResponse.ok) {
        const errText = await falResponse.text();
        throw new Error(`Fal.ai Error: ${falResponse.status} - ${errText}`);
      }

      const falJson = await falResponse.json();
      imageUrl = falJson.images && falJson.images[0]?.url;
    } else if (provider === 'replicate') {
      if (!replicateKey) return res.status(400).json({ error: 'Replicate API token is required' });
      
      console.log(`Generating thumbnail via Replicate Flux Schnell...`);
      const repResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${replicateKey}`
        },
        body: JSON.stringify({
          version: "0bc9e848e3439371ac791505dbac0d326fccaec2eb483ee030dbbbad2c1c2430", // Flux Schnell Default version
          input: {
            prompt: stylePrompt,
            aspect_ratio: project.aspectRatio === '16:9' ? '16:9' : project.aspectRatio === '9:16' ? '9:16' : '1:1'
          }
        })
      });

      if (!repResponse.ok) {
        const errText = await repResponse.text();
        throw new Error(`Replicate Error: ${repResponse.status} - ${errText}`);
      }

      const prediction = await repResponse.json();
      const predictionId = prediction.id;

      let completed = false;
      let attempts = 0;
      while (!completed && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        const checkRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: { 'Authorization': `Token ${replicateKey}` }
        });
        if (checkRes.ok) {
          const statusJson = await checkRes.json();
          if (statusJson.status === 'succeeded') {
            completed = true;
            imageUrl = Array.isArray(statusJson.output) ? statusJson.output[0] : statusJson.output;
          } else if (statusJson.status === 'failed') {
            throw new Error(`Replicate thumbnail job failed: ${statusJson.error || 'Unknown error'}`);
          }
        }
      }
    } else {
      return res.status(400).json({ error: 'Please select Fal or Replicate provider for Thumbnail generation' });
    }

    if (!imageUrl) {
      throw new Error('Thumbnail generation timed out or failed to return image URL.');
    }

    console.log(`Downloading thumbnail from ${imageUrl}...`);
    const downloader = imageUrl.startsWith('https') ? downloadFileHttps : downloadFile;
    await downloader(imageUrl, outputPath);

    const thumbnailUrl = `/projects/${id}/assets/${outputFilename}?t=${Date.now()}`;
    await db.updateProject(id, req.userId, { thumbnailUrl });
    await db.incrementUsage(req.userId, 'thumbnail');

    res.json({ success: true, thumbnailUrl });

  } catch (e) {
    console.error('Thumbnail generation failed:', e);
    res.status(500).json({ error: 'Thumbnail generation failed', details: e.message });
  }
});

// --- AI SCRIPT GENERATOR ---
app.post('/api/projects/:id/generate-script-ai', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { provider, falKey, replicateKey, topic, style, sceneCount } = req.body;

  try {
    const project = await db.getProject(id, req.userId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const key = provider === 'fal' ? falKey : replicateKey;
    if (!key) return res.status(400).json({ error: `${provider === 'fal' ? 'Fal.ai key' : 'Replicate key'} is required` });

    const scenesNum = parseInt(sceneCount) || 5;

    let styleDesc = '';
    if (style === 'Cinematic') styleDesc = 'cinematic style, dramatic lighting, highly detailed, 4k';
    else if (style === 'Anime') styleDesc = 'anime illustration, hand-drawn style, vibrant colors, studio ghibli aesthetic';
    else if (style === 'Cartoon') styleDesc = '2d cartoon style, colorful, clean vectors, flat illustration';
    else if (style === '3D Animation') styleDesc = '3d animation style, pixar / disney style, claymation, soft lighting';
    else if (style === 'Kids Story') styleDesc = 'storybook style illustration, friendly, child-friendly bright colors, whimsical';
    else if (style === 'Realistic') styleDesc = 'photorealistic style, raw photo, highly detailed, real life camera footage';

    // Construct prompt
    let promptText = `Write a script and video prompts for a video about "${topic}". The style is "${style}".
Generate a title and break down the script into exactly ${scenesNum} sequential scenes.
Each scene must have:
1. "text": Narration script for the voiceover to read (make it engaging and fit the overall narrative).
2. "prompt": A highly descriptive visual prompt to feed into an AI video generator (like Hunyuan Video) to generate a 2-4 second video matching the narration. Include style cues like: "${styleDesc}".

Format the response strictly as a single JSON object with the following structure:
{
  "title": "A short engaging video title",
  "scenes": [
    {
      "text": "Narration text for scene 1",
      "prompt": "AI video visual generation prompt for scene 1"
    },
    ...
  ]
}
Do not include any other text, markdown blocks like \`\`\`json, headers or notes. Just return raw JSON.`;

    let llmResponseText = '';

    if (provider === 'fal') {
      console.log(`Calling Fal any-llm for script generation...`);
      const falRes = await fetch('https://queue.fal.run/fal-ai/any-llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${falKey}`
        },
        body: JSON.stringify({
          model: "google/gemini-flash-1.5",
          prompt: promptText
        })
      });

      if (!falRes.ok) {
        const err = await falRes.text();
        throw new Error(`Fal LLM failed: ${falRes.status} - ${err}`);
      }

      const falJson = await falRes.json();
      llmResponseText = falJson.output || falJson.text;
    } else {
      console.log(`Calling Replicate Llama-3 for script generation...`);
      const repRes = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${replicateKey}`
        },
        body: JSON.stringify({
          version: "70bd49b2085706246f4849b57a7dd388f9f54b73b28b7e28b12204c5409ed566", // Llama 3 8B Instruct Default
          input: {
            prompt: promptText,
            max_new_tokens: 1500
          }
        })
      });

      if (!repRes.ok) {
        const err = await repRes.text();
        throw new Error(`Replicate LLM failed: ${repRes.status} - ${err}`);
      }

      const prediction = await repRes.json();
      const predictionId = prediction.id;

      let completed = false;
      let attempts = 0;
      while (!completed && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        const checkRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: { 'Authorization': `Token ${replicateKey}` }
        });
        if (checkRes.ok) {
          const statusJson = await checkRes.json();
          if (statusJson.status === 'succeeded') {
            completed = true;
            llmResponseText = Array.isArray(statusJson.output) ? statusJson.output.join('') : statusJson.output;
          } else if (statusJson.status === 'failed') {
            throw new Error(`Replicate LLM job failed: ${statusJson.error || 'Unknown error'}`);
          }
        }
      }
    }

    if (!llmResponseText) {
      throw new Error('LLM did not return any response.');
    }

    console.log('Parsing LLM script response...');
    let jsonText = llmResponseText.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    }

    const parsed = JSON.parse(jsonText);
    if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
      throw new Error('Invalid JSON structure returned by LLM');
    }

    const scenes = parsed.scenes.map((s, idx) => ({
      index: idx,
      text: s.text,
      prompt: s.prompt,
      voiceUrl: '',
      videoUrl: '',
      duration: 0,
      voiceoverStatus: 'pending',
      videoStatus: 'pending'
    }));

    const fullScript = scenes.map(s => s.text).join('\n\n');
    
    const updatedProject = await db.updateProject(id, req.userId, {
      title: parsed.title || project.title,
      script: fullScript,
      scenes
    });

    res.json({ success: true, project: updatedProject });

  } catch (e) {
    console.error('AI script generation failed:', e);
    res.status(500).json({ error: 'AI script generation failed', details: e.message });
  }
});

// --- SERVER INITIALIZATION ---

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`  AI Video Content Studio is now running!`);
  console.log(`  Local Address: http://localhost:${PORT}`);
  console.log(`=================================================`);
});



