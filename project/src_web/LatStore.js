import { sha256 } from './crypto.js';
import { userLogin, userRegister, userLogout, updateRootFile, userStreamListener } from './user.js';

const workerCount = navigator.hardwareConcurrency > 2 ? 2 : 1 || 1;
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks

/*
  LatStore class to manage user authentication and file operations.
  This class handles login, logout, and maintains user session state.
  Sync file operations are managed with web workers for efficiency.
*/

class LatStore {
  constructor() {
    this.deviceName = null;
    this.userId = null;
    this.email = null;
    this.authToken = null;
    this.isLoggedIn = false;
    this.rootFileData = null;
    this.rootFileEtag = null;
    this.endpoint = null;
    this.files = null;
    this.uploadResults = [];
    this.workers = Array.from({ length: workerCount }, () => new Worker('public/worker.js'));
    this.listener = null;
  }

  async login(username, deviceName, password, endpoint) {
    try {
      const sha256username = await sha256(username, 'hex');
      const loginResp = await userLogin(sha256username, deviceName, username, endpoint);
      if (loginResp.ok && loginResp.token) {
        this.userId = sha256username;
        this.email = username;
        this.deviceName = deviceName;
        this.authToken = loginResp.token;
        this.isLoggedIn = true;
        this.password = password;
        this.endpoint = endpoint;
        this.rootFileData = new Map(Object.entries(loginResp.data));
        this.rootFileEtag = loginResp.dataEtag;
        this.listener = this._listenForUpdates();
      } else {
        this.isLoggedIn = false;
        alert(loginResp.message);
      }
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      return this.isLoggedIn;
    }
  }

  async logout() {
    if (!this.isLoggedIn) return true;
    if (!this.userId || !this.endpoint) {
      console.error('Cannot logout: Missing userId or endpoint');
      return;
    } else {
      await userLogout(this.userId, this.endpoint);
    }
    this.userId = '';
    this.authToken = '';
    this.isLoggedIn = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.listener = null;
    this.rootFileData = null;
    return true;
  }

  async register(username, deviceName, password, endpoint) {
    try {
      const userId = await sha256(username, 'hex');
      const registerResp = await userRegister(userId, deviceName, username, endpoint, []);
      if (registerResp.ok) {
        this.userId = userId;
        this.email = username;
        this.deviceName = deviceName;
        this.password = password;
        this.endpoint = endpoint;
        this.files = [];
      }
      return registerResp;
    } catch (error) {
      console.error('Registration failed:', error);
      return { ok: false, message: 'Registration failed due to an error.' };
    }
  }

  async addNewDir(parentId, name) {
    if (!this.isLoggedIn || !this.userId || !this.deviceName || !this.endpoint || !this.authToken) {
      console.error('Cannot add directory: User not logged in or missing information');
      return;
    }
    const newDir = {
      id: crypto.randomUUID(),
      name: name,
      type: 'inode/directory',
      children: [],
      parent: parentId,
    };
    // const isRootfileArray = Array.isArray(this.rootFileData);
    // if (isRootfileArray) {
    //   this.rootFileData.push(newDir);
    // } else {
    //   this.rootFileData = [newDir];
    // }
    this.rootFileData.set(newDir.id, newDir);
    const updated = await this.updateRootFile();
    if (updated) {
      console.log('Directory added successfully');
    } else {
      console.error('Failed to add directory - retry');
      await this.addNewDir(parentId, name);
    }
    return updated;
  }

  async updateRootFile() {
    if (!this.isLoggedIn || !this.userId || !this.endpoint || !this.rootFileEtag || !this.authToken) {
      console.error('Cannot update root file: User not logged in or missing information');
      return;
    }
    const updated = await updateRootFile(
      this.userId,
      this.authToken,
      this.rootFileEtag,
      this.endpoint,
      this.rootFileData,
    );
    if (updated.ok && updated.dataEtag) {
      this.rootFileEtag = updated.dataEtag;
      return true;
    } else {
      console.error('Failed to update root file');
      this.rootFileData = new Map(Object.entries(updated.data));
      this.rootFileEtag = updated.dataEtag;
      return false;
    }
  }

  async _listenForUpdates() {
    if (
      !this.isLoggedIn ||
      !this.userId ||
      !this.deviceName ||
      !this.endpoint ||
      !this.rootFileEtag ||
      !this.authToken
    ) {
      console.error('Cannot listen for updates: User not logged in or missing information');
      return;
    }
    this.abortController = new AbortController();
    return userStreamListener(
      this.userId,
      this.deviceName,
      this.authToken,
      this.endpoint,
      console.log,
      console.error,
      () => {
        console.log('SSE connection opened');
      },
      this.abortController.signal,
    );
  }

  getFilesInDir(dirId) {
    let files = [];
    for (const item of this.rootFileData.values()) {
      if (item.parent === dirId) {
        files.push(item);
      }
    }
    return files;
  }
}

export default LatStore;
export { LatStore };
