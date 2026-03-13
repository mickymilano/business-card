/**
 * IndexedDB Service for Business Card Scanner
 * Stores all data locally in the browser - survives app redeployments
 */

const DB_NAME = 'BizScanPro';
const DB_VERSION = 1;

// Store names
const STORES = {
  PROJECTS: 'projects',
  CONTACTS: 'contacts',
  COMPANIES: 'companies',
  SETTINGS: 'settings'
};

let db = null;

/**
 * Initialize IndexedDB
 */
export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Projects store
      if (!database.objectStoreNames.contains(STORES.PROJECTS)) {
        const projectStore = database.createObjectStore(STORES.PROJECTS, { keyPath: 'id' });
        projectStore.createIndex('name', 'name', { unique: false });
        projectStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // Contacts store
      if (!database.objectStoreNames.contains(STORES.CONTACTS)) {
        const contactStore = database.createObjectStore(STORES.CONTACTS, { keyPath: 'id' });
        contactStore.createIndex('project_id', 'project_id', { unique: false });
        contactStore.createIndex('review_status', 'review_status', { unique: false });
        contactStore.createIndex('duplicate_status', 'duplicate_status', { unique: false });
      }

      // Companies store
      if (!database.objectStoreNames.contains(STORES.COMPANIES)) {
        const companyStore = database.createObjectStore(STORES.COMPANIES, { keyPath: 'id' });
        companyStore.createIndex('project_id', 'project_id', { unique: false });
      }

      // Settings store
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };
  });
};

/**
 * Generic CRUD operations
 */
const getStore = async (storeName, mode = 'readonly') => {
  const database = await initDB();
  const transaction = database.transaction(storeName, mode);
  return transaction.objectStore(storeName);
};

// ===================
// PROJECTS
// ===================

export const createProject = async (project) => {
  const store = await getStore(STORES.PROJECTS, 'readwrite');
  const now = new Date().toISOString();
  const newProject = {
    id: crypto.randomUUID(),
    name: project.name,
    notes: project.notes || '',
    created_at: now,
    updated_at: now
  };
  
  return new Promise((resolve, reject) => {
    const request = store.add(newProject);
    request.onsuccess = () => resolve(newProject);
    request.onerror = () => reject(request.error);
  });
};

export const getAllProjects = async () => {
  const store = await getStore(STORES.PROJECTS);
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = async () => {
      const projects = request.result;
      // Add counts
      for (const p of projects) {
        p.contact_count = await getContactCountByProject(p.id);
        p.company_count = await getCompanyCountByProject(p.id);
      }
      // Sort by created_at descending
      projects.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      resolve(projects);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getProject = async (id) => {
  const store = await getStore(STORES.PROJECTS);
  
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = async () => {
      const project = request.result;
      if (project) {
        project.contact_count = await getContactCountByProject(id);
        project.company_count = await getCompanyCountByProject(id);
      }
      resolve(project);
    };
    request.onerror = () => reject(request.error);
  });
};

export const updateProject = async (id, updates) => {
  const store = await getStore(STORES.PROJECTS, 'readwrite');
  
  return new Promise((resolve, reject) => {
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const project = getRequest.result;
      if (!project) {
        reject(new Error('Project not found'));
        return;
      }
      const updated = { ...project, ...updates, updated_at: new Date().toISOString() };
      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const deleteProject = async (id) => {
  // Delete project
  const projectStore = await getStore(STORES.PROJECTS, 'readwrite');
  
  return new Promise(async (resolve, reject) => {
    // Delete all contacts and companies for this project first
    await deleteContactsByProject(id);
    await deleteCompaniesByProject(id);
    
    const request = projectStore.delete(id);
    request.onsuccess = () => resolve({ message: 'Project deleted' });
    request.onerror = () => reject(request.error);
  });
};

// ===================
// CONTACTS
// ===================

export const createContact = async (projectId, contact) => {
  const store = await getStore(STORES.CONTACTS, 'readwrite');
  const now = new Date().toISOString();
  const newContact = {
    id: crypto.randomUUID(),
    project_id: projectId,
    first_name: contact.first_name || '',
    middle_name: contact.middle_name || '',
    last_name: contact.last_name || '',
    full_name: contact.full_name || '',
    full_name_original: contact.full_name_original || '',
    job_title: contact.job_title || '',
    department: contact.department || '',
    mobile_phone: contact.mobile_phone || '',
    direct_phone: contact.direct_phone || '',
    office_phone: contact.office_phone || '',
    primary_email: contact.primary_email || '',
    secondary_email: contact.secondary_email || '',
    linkedin_url: contact.linkedin_url || '',
    personal_website: contact.personal_website || '',
    company_id: contact.company_id || '',
    company_name_display: contact.company_name_display || '',
    brand_name: contact.brand_name || '',
    legal_company_name: contact.legal_company_name || '',
    address: contact.address || '',
    postal_code: contact.postal_code || '',
    country: contact.country || '',
    import_source_type: contact.import_source_type || 'manual',
    import_source_file: contact.import_source_file || '',
    confidence_score: contact.confidence_score || 0,
    validation_status: contact.validation_status || 'pending',
    review_status: contact.review_status || 'pending',
    duplicate_status: contact.duplicate_status || 'none',
    ai_notes: contact.ai_notes || '',
    notes: contact.notes || '',
    created_at: now,
    updated_at: now
  };
  
  return new Promise((resolve, reject) => {
    const request = store.add(newContact);
    request.onsuccess = () => resolve(newContact);
    request.onerror = () => reject(request.error);
  });
};

export const getContactsByProject = async (projectId, filters = {}) => {
  const store = await getStore(STORES.CONTACTS);
  const index = store.index('project_id');
  
  return new Promise((resolve, reject) => {
    const request = index.getAll(projectId);
    request.onsuccess = () => {
      let contacts = request.result;
      
      // Apply filters
      if (filters.review_status) {
        contacts = contacts.filter(c => c.review_status === filters.review_status);
      }
      if (filters.duplicate_status) {
        contacts = contacts.filter(c => c.duplicate_status === filters.duplicate_status);
      }
      
      // Sort by created_at descending
      contacts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      resolve(contacts);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getContact = async (id) => {
  const store = await getStore(STORES.CONTACTS);
  
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const updateContact = async (id, updates) => {
  const store = await getStore(STORES.CONTACTS, 'readwrite');
  
  return new Promise((resolve, reject) => {
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const contact = getRequest.result;
      if (!contact) {
        reject(new Error('Contact not found'));
        return;
      }
      const updated = { ...contact, ...updates, updated_at: new Date().toISOString() };
      const putRequest = store.put(updated);
      putRequest.onsuccess = () => resolve(updated);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const deleteContact = async (id) => {
  const store = await getStore(STORES.CONTACTS, 'readwrite');
  
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve({ message: 'Contact deleted' });
    request.onerror = () => reject(request.error);
  });
};

export const getContactCountByProject = async (projectId) => {
  const store = await getStore(STORES.CONTACTS);
  const index = store.index('project_id');
  
  return new Promise((resolve, reject) => {
    const request = index.count(projectId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deleteContactsByProject = async (projectId) => {
  const contacts = await getContactsByProject(projectId);
  const store = await getStore(STORES.CONTACTS, 'readwrite');
  
  return Promise.all(contacts.map(c => 
    new Promise((resolve, reject) => {
      const request = store.delete(c.id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    })
  ));
};

// ===================
// COMPANIES
// ===================

export const createCompany = async (projectId, company) => {
  const store = await getStore(STORES.COMPANIES, 'readwrite');
  const now = new Date().toISOString();
  const newCompany = {
    id: crypto.randomUUID(),
    project_id: projectId,
    legal_company_name: company.legal_company_name || '',
    brand_name: company.brand_name || '',
    company_display_name: company.company_display_name || '',
    website: company.website || '',
    main_phone: company.main_phone || '',
    main_email: company.main_email || '',
    address: company.address || '',
    city: company.city || '',
    postal_code: company.postal_code || '',
    province_region: company.province_region || '',
    country: company.country || '',
    industry: company.industry || '',
    validation_status: company.validation_status || 'pending',
    notes: company.notes || '',
    created_at: now,
    updated_at: now
  };
  
  return new Promise((resolve, reject) => {
    const request = store.add(newCompany);
    request.onsuccess = () => resolve(newCompany);
    request.onerror = () => reject(request.error);
  });
};

export const getCompaniesByProject = async (projectId) => {
  const store = await getStore(STORES.COMPANIES);
  const index = store.index('project_id');
  
  return new Promise((resolve, reject) => {
    const request = index.getAll(projectId);
    request.onsuccess = () => {
      const companies = request.result;
      companies.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      resolve(companies);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getCompany = async (id) => {
  const store = await getStore(STORES.COMPANIES);
  
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deleteCompany = async (id) => {
  const store = await getStore(STORES.COMPANIES, 'readwrite');
  
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve({ message: 'Company deleted' });
    request.onerror = () => reject(request.error);
  });
};

export const getCompanyCountByProject = async (projectId) => {
  const store = await getStore(STORES.COMPANIES);
  const index = store.index('project_id');
  
  return new Promise((resolve, reject) => {
    const request = index.count(projectId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deleteCompaniesByProject = async (projectId) => {
  const companies = await getCompaniesByProject(projectId);
  const store = await getStore(STORES.COMPANIES, 'readwrite');
  
  return Promise.all(companies.map(c => 
    new Promise((resolve, reject) => {
      const request = store.delete(c.id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    })
  ));
};

// ===================
// SETTINGS
// ===================

export const getSetting = async (key) => {
  const store = await getStore(STORES.SETTINGS);
  
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
};

export const setSetting = async (key, value) => {
  const store = await getStore(STORES.SETTINGS, 'readwrite');
  
  return new Promise((resolve, reject) => {
    const request = store.put({ key, value });
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
};

export const getSettings = async () => {
  const store = await getStore(STORES.SETTINGS);
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const settings = {};
      request.result.forEach(item => {
        settings[item.key] = item.value;
      });
      resolve(settings);
    };
    request.onerror = () => reject(request.error);
  });
};

// ===================
// EXPORT HELPERS
// ===================

export const exportProjectData = async (projectId) => {
  const project = await getProject(projectId);
  const contacts = await getContactsByProject(projectId);
  const companies = await getCompaniesByProject(projectId);
  
  return {
    project,
    contacts,
    companies
  };
};

// ===================
// BACKUP & RESTORE
// ===================

export const createFullBackup = async () => {
  const projects = await getAllProjects();
  const allContacts = [];
  const allCompanies = [];
  
  for (const project of projects) {
    const contacts = await getContactsByProject(project.id);
    const companies = await getCompaniesByProject(project.id);
    allContacts.push(...contacts);
    allCompanies.push(...companies);
  }
  
  const settings = await getSettings();
  
  return {
    version: '2.0',
    exported_at: new Date().toISOString(),
    data: {
      projects,
      contacts: allContacts,
      companies: allCompanies,
      settings
    }
  };
};

export const restoreFromBackup = async (backupData, options = { merge: false }) => {
  if (!backupData || !backupData.data) {
    throw new Error('Invalid backup file');
  }

  const { projects, contacts, companies, settings } = backupData.data;
  const results = {
    projects_imported: 0,
    contacts_imported: 0,
    companies_imported: 0,
    skipped: 0
  };

  // Clear existing data if not merging
  if (!options.merge) {
    const existingProjects = await getAllProjects();
    for (const p of existingProjects) {
      await deleteProject(p.id);
    }
  }

  // Import projects
  const projectStore = await getStore(STORES.PROJECTS, 'readwrite');
  for (const project of projects || []) {
    try {
      await new Promise((resolve, reject) => {
        const request = projectStore.put(project);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      results.projects_imported++;
    } catch (e) {
      results.skipped++;
    }
  }

  // Import contacts
  const contactStore = await getStore(STORES.CONTACTS, 'readwrite');
  for (const contact of contacts || []) {
    try {
      await new Promise((resolve, reject) => {
        const request = contactStore.put(contact);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      results.contacts_imported++;
    } catch (e) {
      results.skipped++;
    }
  }

  // Import companies
  const companyStore = await getStore(STORES.COMPANIES, 'readwrite');
  for (const company of companies || []) {
    try {
      await new Promise((resolve, reject) => {
        const request = companyStore.put(company);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      results.companies_imported++;
    } catch (e) {
      results.skipped++;
    }
  }

  // Import settings
  if (settings) {
    for (const [key, value] of Object.entries(settings)) {
      await setSetting(key, value);
    }
  }

  return results;
};

// Initialize DB on module load
initDB().catch(console.error);

export default {
  initDB,
  // Projects
  createProject,
  getAllProjects,
  getProject,
  updateProject,
  deleteProject,
  // Contacts
  createContact,
  getContactsByProject,
  getContact,
  updateContact,
  deleteContact,
  // Companies
  createCompany,
  getCompaniesByProject,
  getCompany,
  deleteCompany,
  // Settings
  getSetting,
  setSetting,
  getSettings,
  // Export
  exportProjectData,
  // Backup
  createFullBackup,
  restoreFromBackup
};
