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
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const isSupabaseEnabled = SUPABASE_URL && SUPABASE_KEY;

let supabase = null;
if (isSupabaseEnabled) {
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
    
    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('users')
        .insert([{ id: userId, email, password_hash: passwordHash }])
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return data;
    } else {
      const users = getLocalUsers();
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('Email already exists');
      }
      const newUser = { id: userId, email, passwordHash, createdAt: new Date().toISOString() };
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
      
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: data.id,
        email: data.email,
        passwordHash: data.password_hash,
        createdAt: data.created_at
      };
    } else {
      const users = getLocalUsers();
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      return user || null;
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
    if (isSupabaseEnabled) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) throw new Error(error.message);
      if (!data) return null;
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
        createdAt: data.created_at
      };
    } else {
      const projectDir = path.join(PROJECTS_DIR, id);
      const file = path.join(projectDir, 'project.json');
      if (!fs.existsSync(file)) return null;
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (data.userId !== userId) return null;
        return data;
      } catch (e) {
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

      const { data, error } = await supabase
        .from('projects')
        .update(dbFields)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw new Error(error.message);
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
        createdAt: data.created_at
      };
    } else {
      const projectDir = path.join(PROJECTS_DIR, id);
      const file = path.join(projectDir, 'project.json');
      if (!fs.existsSync(file)) throw new Error('Project not found');
      
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.userId !== userId) throw new Error('Unauthorized');
      
      const updatedData = { ...data, ...updatedFields, id: data.id, userId: data.userId };
      fs.writeFileSync(file, JSON.stringify(updatedData, null, 2), 'utf8');

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
