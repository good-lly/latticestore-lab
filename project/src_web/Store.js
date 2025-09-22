import { sha256, encryptData } from './crypto.js';
import { uploadWithSharedQueue, downloadAndDecryptFile } from './helpers.js';
import { userLogin, userRegister, userLogout } from './user.js';
import { VirtualFileSystem } from './VFS.js';

const workerCount = navigator.hardwareConcurrency > 2 ? 2 : 1 || 1;
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
const RANDOM_WANNBE_SALT = 'fpNAqmCqJ23ggq6B2G9Dw1srlKZprhg3';

/**
 * LatStore class with integrated VirtualFileSystem for optimal performance
 * Handles user authentication and efficient file operations
 */
class Store {
  constructor() {
    // User session state
    this.deviceName = null;
    this.userId = null;
    this.email = null;
    this.authToken = null;
    this.isLoggedIn = false;
    this.masterKey = null;
    this.password = null;
    this.endpoint = null;

    // File system state
    this.vfs = new VirtualFileSystem();
    this.rootFileEtag = null;

    // Worker management
    this.workers = Array.from({ length: workerCount }, () => new Worker('public/worker.js'));
    this.abortController = null;
    this.listener = null;
  }

  /**
   * Register a new user account
   */
  async register(username, deviceName, password, endpoint) {
    try {
      // Create empty VFS structure
      const emptyVfs = { nodes: {} };
      const uint8 = new TextEncoder().encode(JSON.stringify(emptyVfs));

      const [userId, filePwd, filePwdAB] = await Promise.all([
        sha256(username, 'hex'),
        sha256(password, 'hex'),
        sha256(password, 'arraybuffer'),
      ]);

      const keyBuffer = await crypto.subtle.digest('SHA-256', filePwdAB);
      const encryptedRootFile = await encryptData(uint8, keyBuffer);
      const userPasswordHash = await sha256(filePwd + RANDOM_WANNBE_SALT, 'hex');

      const registerResp = await userRegister(
        userId,
        userPasswordHash,
        deviceName,
        username,
        endpoint,
        btoa(String.fromCharCode(...encryptedRootFile)),
      );

      return registerResp;
    } catch (error) {
      console.error('Registration failed:', error);
      return { ok: false, message: 'Registration failed due to an error.' };
    }
  }

  /**
   * Login and initialize the virtual file system
   */
  async login(username, deviceName, password, endpoint) {
    try {
      const [userId, filePwd, filePwdAB] = await Promise.all([
        sha256(username, 'hex'),
        sha256(password, 'hex'),
        sha256(password, 'arraybuffer'),
      ]);

      const userPasswordHash = await sha256(filePwd + RANDOM_WANNBE_SALT, 'hex');
      const loginResp = await userLogin(userId, userPasswordHash, deviceName, username, endpoint);

      if (loginResp.ok && loginResp.token) {
        // Set session state
        this.userId = userId;
        this.email = username;
        this.deviceName = deviceName;
        this.authToken = loginResp.token;
        this.isLoggedIn = true;
        this.endpoint = endpoint;
        this.masterKey = await crypto.subtle.digest('SHA-256', filePwdAB);
        this.password = userPasswordHash;

        // Load and initialize VFS
        const { ok, error, data, etag } = await this.getRootFile();
        if (ok && data) {
          console.warn('Decrypted root file data:', data);
          console.log('Root file loaded with', Object.keys(data.nodes || {}).length, 'nodes');
          this.vfs.fromJSON(data);
          this.rootFileEtag = etag || null;
        } else {
          console.log('Initializing new VFS (root file not found or empty)');
          // Initialize with empty VFS if root file doesn't exist
          this.vfs.fromJSON({ nodes: {} });
          // rootFileEtag remains null for first save
        }
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

  /**
   * Logout and clean up
   */
  async logout() {
    if (!this.isLoggedIn) return true;

    if (this.userId && this.endpoint) {
      await userLogout(this.userId, this.endpoint);
    }

    // Clear session
    this.userId = '';
    this.authToken = '';
    this.isLoggedIn = false;

    // Clear VFS
    this.vfs = new VirtualFileSystem();
    this.rootFileEtag = null;

    // Cleanup
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.listener = null;

    return true;
  }

  /**
   * Add a new directory to the file system
   */
  async addNewDir(parentId, name) {
    if (!this.isLoggedIn || !this.userId || !this.authToken) {
      console.error('Cannot add directory: User not logged in');
      return false;
    }

    const newDir = {
      id: crypto.randomUUID(),
      name: name,
      type: 'inode/directory',
      parent: parentId,
      metadata: {
        created: Date.now(),
        modified: Date.now(),
      },
    };

    this.vfs.addNode(newDir);
    return await this.updateRootFile();
  }

  /**
   * Add a new file entry to the file system
   */
  async addFile(parentId, name, type = 'application/octet-stream', metadata = {}) {
    if (!this.isLoggedIn || !this.userId || !this.authToken) {
      console.error('Cannot add file: User not logged in');
      return false;
    }

    const newFile = {
      id: crypto.randomUUID(),
      name: name,
      type: type,
      parent: parentId,
      metadata: {
        created: Date.now(),
        modified: Date.now(),
        ...metadata,
      },
    };

    this.vfs.addNode(newFile);
    return await this.updateRootFile();
  }

  /**
   * Delete a file or directory (and all its descendants)
   */
  async deleteFile(fileId) {
    if (!this.isLoggedIn || !this.userId || !this.authToken) {
      console.error('Cannot delete file: User not logged in');
      return false;
    }

    const success = this.vfs.deleteNode(fileId);
    if (success) {
      return await this.updateRootFile();
    }

    return false;
  }

  /**
   * Move a file or directory to a new parent
   */
  async moveFile(fileId, newParentId) {
    if (!this.isLoggedIn || !this.userId || !this.authToken) {
      console.error('Cannot move file: User not logged in');
      return false;
    }

    try {
      this.vfs.moveNode(fileId, newParentId);
      return await this.updateRootFile();
    } catch (error) {
      console.error('Move operation failed:', error);
      return false;
    }
  }

  /**
   * Rename a file or directory
   */
  async renameFile(fileId, newName) {
    if (!this.isLoggedIn || !this.userId || !this.authToken) {
      console.error('Cannot rename file: User not logged in');
      return false;
    }

    const node = this.vfs.nodes.get(fileId);
    if (!node) {
      console.error('File not found');
      return false;
    }

    node.name = newName;
    node.metadata = node.metadata || {};
    node.metadata.modified = Date.now();

    // Invalidate path cache for this node and descendants
    this.vfs.invalidatePathCacheBranch(fileId);

    return await this.updateRootFile();
  }

  /**
   * Delete multiple files in a single operation
   */
  async batchDelete(fileIds) {
    if (!this.isLoggedIn || !this.userId || !this.authToken) {
      console.error('Cannot delete files: User not logged in');
      return false;
    }

    const deletedCount = this.vfs.batchDelete(fileIds);
    if (deletedCount > 0) {
      return await this.updateRootFile();
    }

    return false;
  }

  /**
   * Get immediate children of a directory - O(1) operation
   */
  getFilesInDir(dirId) {
    return this.vfs.getChildren(dirId);
  }

  /**
   * Get the full path array for a file/directory with ID
   */
  getFullPathByIdArray(id) {
    if (!id) return [{ name: '/', id: null }];
    const path = this.vfs.getPath(id);
    return path.length > 0 ? [...path] : [{ name: '/', id: null }];
  }

  /**
   * Get the full path as a string
   */
  getFullPathString(id, separator = '/') {
    if (!id) return '/';
    return this.vfs.getPathString(id, separator);
  }

  /**
   * Find files by name
   */
  findFilesByName(name) {
    return this.vfs.findByName(name);
  }

  /**
   * Find all files of a specific type
   */
  findFilesByType(type) {
    return this.vfs.findByType(type);
  }

  /**
   * Get a specific node by ID
   */
  getNodeById(id) {
    return this.vfs.nodes.get(id);
  }

  /**
   * Check if a node exists
   */
  nodeExists(id) {
    return this.vfs.nodes.has(id);
  }

  /**
   * Get all root nodes (nodes without parents)
   */
  getRootNodes() {
    const roots = [];
    for (const [id, node] of this.vfs.nodes) {
      if (!node.parent) {
        roots.push(node);
      }
    }
    return roots;
  }

  /**
   * Traverse the file system tree
   * @param {string} rootId - Starting node (null for all roots)
   * @param {string} strategy - 'breadth-first' or 'depth-first'
   */
  *traverse(rootId = null, strategy = 'breadth-first') {
    yield* this.vfs.traverse(rootId, strategy);
  }

  /**
   * Get statistics about the file system
   */
  getStats() {
    return this.vfs.getStats();
  }

  /**
   * Update the root file on the server
   */
  async updateRootFile() {
    if (!this.isLoggedIn || !this.userId || !this.endpoint || !this.rootFileEtag || !this.authToken) {
      console.error('Cannot update root file: Missing required information');
      return false;
    }

    try {
      // Convert VFS to JSON and encrypt
      console.warn('Serializing VFS with', this.vfs.toJSON());
      const vfsJson = JSON.stringify(this.vfs.toJSON());
      const rootFileData = new TextEncoder().encode(vfsJson);
      console.log('Updating root file with', this.vfs.nodes.size, 'nodes');

      const worker = this.workers[0];

      return new Promise((resolve, reject) => {
        const messageHandler = e => {
          if (e.data.type === 'complete') {
            worker.removeEventListener('message', messageHandler);
            this.rootFileEtag = e.data.data.newEtag;
            console.log('Root file updated successfully', e.data.data);
            resolve(true);
          } else if (e.data.type === 'error') {
            worker.removeEventListener('message', messageHandler);
            console.error('Failed to update root file:', e.data.error);
            reject(new Error(e.data.error));
          }
        };

        worker.addEventListener('message', messageHandler);

        worker.postMessage({
          action: 'uploadSingle',
          data: rootFileData,
          keyData: this.masterKey,
          config: {
            endpoint: this.endpoint,
            authToken: this.authToken,
            userId: this.userId,
          },
          metadata: {
            fileId: `user:${this.userId}.rf`,
            fileName: `user:${this.userId}.rf`,
            etag: this.rootFileEtag,
          },
        });
      });
    } catch (error) {
      console.error('Error updating root file:', error);
      return false;
    }
  }

  /**
   * Get and decrypt the root file from server
   */
  async getRootFile() {
    if (!this.isLoggedIn || !this.userId || !this.endpoint || !this.authToken || !this.workers[0]) {
      console.error('Cannot get root file: Missing required information');
      return { ok: false, error: 'User not logged in or missing information' };
    }

    try {
      const { blob, etag } = await downloadAndDecryptFile(
        `user:${this.userId}.rf`,
        this.masterKey,
        { endpoint: this.endpoint, authToken: this.authToken, userId: this.userId },
        this.workers[0],
      );

      const data = JSON.parse(await blob.text());
      return { ok: true, data, etag };
    } catch (error) {
      console.error('Error fetching root file:', error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Upload multiple files to storage
   */
  async uploadFilelist(fileList, cwdId = null) {
    let uploadPromise = await uploadWithSharedQueue(fileList, this.workers, {
      endpoint: this.endpoint,
      authToken: this.authToken,
      userId: this.userId,
      chunkSize: CHUNK_SIZE,
    });

    // Display results
    console.log('Upload Results:', uploadPromise);

    const successful = [];
    const failed = [];

    // Process results from each file
    for (const [fileId, fileData] of Object.entries(uploadPromise)) {
      if (fileData.errors && fileData.errors.length > 0) {
        failed.push({
          name: fileData.fileName,
          errors: fileData.errors,
        });
      } else {
        successful.push({
          id: fileId,
          name: fileData.fileName,
          type: fileData.fileType,
          size: fileData.fileSize,
          keyData: fileData.keyData,
          parent: cwdId,
          chunks: fileData.chunks,
          totalChunks: fileData.totalChunks,
          metadata: { created: Date.now(), modified: Date.now() },
        });
      }
    }

    if (successful.length === 0 && failed.length === 0) {
      return;
    }
    for (const file of successful) {
      this.vfs.addNode(file);
    }
    await this.updateRootFile();
    return { successful, failed };
  }
}

export default Store;
export { Store };
