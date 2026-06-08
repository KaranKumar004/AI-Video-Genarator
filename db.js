const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Database initialization
const PROJECTS_DIR = path.join(__dirname, 'projects');
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

const USERS_FILE = path.join(PROJECTS_DIR, 'users.json');
const INDEX_FILE = path.join(PROJECTS_DIR, 'projects.json');
const USAGE_FILE = path.join(PROJECTS_DIR, 'usage.json');

// Ensure local JSON files exist
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, '[]', 'utf8');
if (!fs.existsSync(USAGE_FILE)) fs.writeFileSync(USAGE_FILE, '{}', 'utf8');

// Check Supabase env variables
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_KEY || '').trim();
const isSupabaseEnabled = SUPABASE_URL && SUPABASE_KEY;

let supabase = null;
if (isSupabaseEnabled) {
  if (!SUPABASE_URL.startsWith('http://') && !SUPABASE_URL.startsWith('https://')) {
    console.error('==================================================================');
    console.error(' CRITICAL WARNING: SUPABASE_URL does not start with http:// or https://');
    console.error(` Current value: "${SUPABASE_URL}"`);
    console.error(' It should look like: https://xxxx.supabase.co');
    console.error(' You might have pasted the PostgreSQL Connection String by mistake!');
    console.error('==================================================================');
  }
  console.log('Database Mode: Supabase enabled');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.log('Database Mode: Local JSON File fallback');
}

/*
Supabase Table Definitions:

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_pro BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  script TEXT DEFAULT '',
  bg_music TEXT DEFAULT '',
  scenes JSONB DEFAULT '[]'::jsonb,
  compiled_video_url TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  style TEXT DEFAULT 'Realistic Cinematic',
  character_description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE usage (
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  video_count INT DEFAULT 0,
  thumbnail_count INT DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
*/

// --- Helper Functions ---
function getLocalUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveLocalUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function getLocalProjectsList() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveLocalProjectsList(list) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function getLocalUsage() {
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveLocalUsage(usage) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2), 'utf8');
}

// --- DB Adapter Interface ---
const db = {
  isSupabase: isSupabaseEnabled,

  // --- AUTHENTICATION ---
  async createUser(email, passwordHash) {
    const userId = 'user_' + Date.now() + Math.random().toString(36).substr(2, 5);
    const isPro = email.toLowerCase() === 'karankumarsk14@gmail.com';
    
    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('users')
        .insert([{ id: userId, email, password_hash: passwordHash, is_pro: isPro }])
        .select()
        .single();
      
      if (error) {
        console.error('[db.createUser] Supabase insert error:', error);
        throw new Error(error.message);
      }
      return data;
    } else {
      const users = getLocalUsers();
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('Email already exists');
      }
      const newUser = { id: userId, email, passwordHash, isPro, createdAt: new Date().toISOString() };
      users.push(newUser);
      saveLocalUsers(users);
      return newUser;
    }
  },

  async getUserByEmail(email) {
    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      
      if (error) {
        console.error('[db.getUserByEmail] Supabase query error:', error);
        throw new Error(error.message);
      }
      if (!data) return null;
      return {
        id: data.id,
        email: data.email,
        passwordHash: data.password_hash,
        isPro: data.is_pro || false,
        createdAt: data.created_at
      };
    } else {
      const users = getLocalUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      return user || null;
    }
  },

  async getUserById(id) {
    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) {
        console.error('[db.getUserById] Supabase query error:', error);
        throw new Error(error.message);
      }
      if (!data) return null;
      return {
        id: data.id,
        email: data.email,
        passwordHash: data.password_hash,
        isPro: data.is_pro || false,
        createdAt: data.created_at
      };
    } else {
      const users = getLocalUsers();
      const user = users.find(u => u.id === id);
      return user || null;
    }
  },

  async updateUserProStatus(userId, isPro) {
    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('users')
        .update({ is_pro: isPro })
        .eq('id', userId)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return {
        id: data.id,
        email: data.email,
        passwordHash: data.password_hash,
        isPro: data.is_pro || false,
        createdAt: data.created_at
      };
    } else {
      const users = getLocalUsers();
      const idx = users.findIndex(u => u.id === userId);
      if (idx !== -1) {
        users[idx].isPro = isPro;
        saveLocalUsers(users);
        return users[idx];
      }
      throw new Error('User not found');
    }
  },

  // --- PROJECTS ---
  async getProjects(userId) {
    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('projects')
        .select('id, title, aspect_ratio, created_at, compiled_video_url')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw new Error(error.message);
      return data.map(p => ({
        id: p.id,
        title: p.title,
        aspectRatio: p.aspect_ratio,
        createdAt: p.created_at,
        compiledVideoUrl: p.compiled_video_url
      }));
    } else {
      const list = getLocalProjectsList();
      return list.filter(p => p.userId === userId);
    }
  },

  async getProject(id, userId) {
    console.log(`[db.getProject] Loading project. id=${id}, userId=${userId}, isSupabase=${isSupabaseEnabled}`);
    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error(`[db.getProject] Supabase query error:`, error);
        throw new Error(error.message);
      }
      if (!data) {
        console.warn(`[db.getProject] Project not found in Supabase for id=${id}, userId=${userId}`);
        return null;
      }
      console.log(`[db.getProject] Project found in Supabase. Title: "${data.title}"`);
      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        aspectRatio: data.aspect_ratio,
        script: data.script,
        bgMusic: data.bg_music,
        scenes: data.scenes,
        compiledVideoUrl: data.compiled_video_url,
        thumbnailUrl: data.thumbnail_url,
        style: data.style || 'Realistic Cinematic',
        characterDescription: data.character_description || '',
        createdAt: data.created_at
      };
    } else {
      const projectDir = path.join(PROJECTS_DIR, id);
      const file = path.join(projectDir, 'project.json');
      console.log(`[db.getProject] Local file check: ${file}`);
      if (!fs.existsSync(file)) {
        console.warn(`[db.getProject] Local project file does not exist: ${file}`);
        return null;
      }
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        console.log(`[db.getProject] Local project file loaded. data.userId=${data.userId}, query userId=${userId}`);
        if (data.userId !== userId) {
          console.warn(`[db.getProject] Local project userId mismatch! data.userId=${data.userId}, query userId=${userId}`);
          return null;
        }
        return data;
      } catch (e) {
        console.error(`[db.getProject] Local project file parse error:`, e);
        return null;
      }
    }
  },

  async createProject(userId, title, aspectRatio) {
    const projectId = 'project_' + Date.now();
    
    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('projects')
        .insert([{
          id: projectId,
          user_id: userId,
          title,
          aspect_ratio: aspectRatio,
          scenes: []
        }])
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return data;
    } else {
      const projectDir = path.join(PROJECTS_DIR, projectId);
      const assetsDir = path.join(projectDir, 'assets');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(assetsDir, { recursive: true });

      const projectData = {
        id: projectId,
        userId,
        title,
        aspectRatio,
        script: '',
        bgMusic: '',
        scenes: [],
        compiledVideoUrl: '',
        thumbnailUrl: '',
        createdAt: new Date().toISOString()
      };

      fs.writeFileSync(path.join(projectDir, 'project.json'), JSON.stringify(projectData, null, 2), 'utf8');

      // Update index
      const list = getLocalProjectsList();
      list.unshift({
        id: projectId,
        userId,
        title,
        aspectRatio,
        createdAt: projectData.createdAt
      });
      saveLocalProjectsList(list);

      return projectData;
    }
  },

  async updateProject(id, userId, updatedFields) {
    console.log(`[db.updateProject] Updating project. id=${id}, userId=${userId}, isSupabase=${isSupabaseEnabled}, fields=`, Object.keys(updatedFields));
    if (isSupabaseEnabled) {
      // Map JS camelCase fields to database snake_case
      const dbFields = {};
      if (updatedFields.title !== undefined) dbFields.title = updatedFields.title;
      if (updatedFields.aspectRatio !== undefined) dbFields.aspect_ratio = updatedFields.aspectRatio;
      if (updatedFields.script !== undefined) dbFields.script = updatedFields.script;
      if (updatedFields.bgMusic !== undefined) dbFields.bg_music = updatedFields.bgMusic;
      if (updatedFields.scenes !== undefined) dbFields.scenes = updatedFields.scenes;
      if (updatedFields.compiledVideoUrl !== undefined) dbFields.compiled_video_url = updatedFields.compiledVideoUrl;
      if (updatedFields.thumbnailUrl !== undefined) dbFields.thumbnail_url = updatedFields.thumbnailUrl;
      if (updatedFields.style !== undefined) dbFields.style = updatedFields.style;
      if (updatedFields.characterDescription !== undefined) dbFields.character_description = updatedFields.characterDescription;

      const { data, error } = await supabase
        .from('projects')
        .update(dbFields)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error(`[db.updateProject] Supabase update error:`, error);
        throw new Error(error.message);
      }
      console.log(`[db.updateProject] Supabase update succeeded.`);
      return {
        id: data.id,
        userId: data.user_id,
        title: data.title,
        aspectRatio: data.aspect_ratio,
        script: data.script,
        bgMusic: data.bg_music,
        scenes: data.scenes,
        compiledVideoUrl: data.compiled_video_url,
        thumbnailUrl: data.thumbnail_url,
        style: data.style || 'Realistic Cinematic',
        characterDescription: data.character_description || '',
        createdAt: data.created_at
      };
    } else {
      const projectDir = path.join(PROJECTS_DIR, id);
      const file = path.join(projectDir, 'project.json');
      console.log(`[db.updateProject] Local file check: ${file}`);
      if (!fs.existsSync(file)) {
        console.error(`[db.updateProject] Local project file does not exist for update: ${file}`);
        throw new Error('Project not found');
      }
      
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      console.log(`[db.updateProject] Local project loaded. data.userId=${data.userId}, query userId=${userId}`);
      if (data.userId !== userId) {
        console.error(`[db.updateProject] Local project userId mismatch! data.userId=${data.userId}, query userId=${userId}`);
        throw new Error('Unauthorized');
      }
      
      const updatedData = { ...data, ...updatedFields, id: data.id, userId: data.userId };
      fs.writeFileSync(file, JSON.stringify(updatedData, null, 2), 'utf8');
      console.log(`[db.updateProject] Local file updated successfully.`);

      // Update index if title or aspect ratio changed
      if (updatedFields.title !== undefined || updatedFields.aspectRatio !== undefined) {
        const list = getLocalProjectsList();
        const idx = list.findIndex(p => p.id === id);
        if (idx !== -1) {
          if (updatedFields.title !== undefined) list[idx].title = updatedFields.title;
          if (updatedFields.aspectRatio !== undefined) list[idx].aspectRatio = updatedFields.aspectRatio;
          saveLocalProjectsList(list);
        }
      }

      return updatedData;
    }
  },

  async deleteProject(id, userId) {
    if (isSupabaseEnabled) {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      
      if (error) throw new Error(error.message);
      return true;
    } else {
      const projectDir = path.join(PROJECTS_DIR, id);
      if (fs.existsSync(projectDir)) {
        // Simple recursive folder delete
        try {
          fs.rmSync(projectDir, { recursive: true, force: true });
        } catch (e) {
          // fallback in case rmSync fails
        }
      }
      
      const list = getLocalProjectsList();
      const filtered = list.filter(p => !(p.id === id && p.userId === userId));
      saveLocalProjectsList(filtered);
      return true;
    }
  },

  // --- USAGE TRACKING ---
  async checkUsageLimit(userId, type) {
    try {
      const user = await db.getUserById(userId);
      if (user && (user.isPro || user.email.toLowerCase() === 'karankumarsk14@gmail.com')) {
        console.log(`[db.checkUsageLimit] User ${user.email} is Pro/Admin. Bypassing usage limits.`);
        return true;
      }
    } catch (err) {
      console.warn('[db.checkUsageLimit] Failed to fetch user for limit check:', err);
    }

    const today = new Date().toISOString().split('T')[0];
    const maxVideo = 3;
    const maxThumbnail = 10;

    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('usage')
        .select('*')
        .eq('user_id', userId)
        .eq('day', today)
        .maybeSingle();

      if (error) throw new Error(error.message);
      
      const videoCount = data ? data.video_count : 0;
      const thumbnailCount = data ? data.thumbnail_count : 0;

      if (type === 'video') return videoCount < maxVideo;
      if (type === 'thumbnail') return thumbnailCount < maxThumbnail;
      return true;
    } else {
      const usage = getLocalUsage();
      const userKey = `${userId}:${today}`;
      const record = usage[userKey] || { videoCount: 0, thumbnailCount: 0 };

      if (type === 'video') return record.videoCount < maxVideo;
      if (type === 'thumbnail') return record.thumbnailCount < maxThumbnail;
      return true;
    }
  },

  async incrementUsage(userId, type) {
    const today = new Date().toISOString().split('T')[0];

    if (isSupabaseEnabled) {
      // Use SQL upsert with increments
      const { data: existing } = await supabase
        .from('usage')
        .select('*')
        .eq('user_id', userId)
        .eq('day', today)
        .maybeSingle();

      if (existing) {
        const updates = {};
        if (type === 'video') updates.video_count = existing.video_count + 1;
        if (type === 'thumbnail') updates.thumbnail_count = existing.thumbnail_count + 1;

        await supabase
          .from('usage')
          .update(updates)
          .eq('user_id', userId)
          .eq('day', today);
      } else {
        const insert = {
          user_id: userId,
          day: today,
          video_count: type === 'video' ? 1 : 0,
          thumbnail_count: type === 'thumbnail' ? 1 : 0
        };
        await supabase.from('usage').insert([insert]);
      }
    } else {
      const usage = getLocalUsage();
      const userKey = `${userId}:${today}`;
      if (!usage[userKey]) usage[userKey] = { videoCount: 0, thumbnailCount: 0 };
      
      if (type === 'video') usage[userKey].videoCount++;
      if (type === 'thumbnail') usage[userKey].thumbnailCount++;
      
      saveLocalUsage(usage);
    }
  }
};

module.exports = db;
