use std::collections::HashMap;

use super::channel_cipher::{
    derive_pairwise_bootstrap_key, WORKSPACE_KEY_LEN,
};

#[derive(Clone)]
pub struct WorkspaceKeyEntry {
    pub workspace_key: [u8; WORKSPACE_KEY_LEN],
    pub key_version: u32,
}

#[derive(Default)]
pub struct WorkspaceKeyRegistry {
    entries: HashMap<String, WorkspaceKeyEntry>,
}

impl WorkspaceKeyRegistry {
    pub fn set_workspace_key(
        &mut self,
        workspace_id: &str,
        workspace_key: [u8; WORKSPACE_KEY_LEN],
        key_version: u32,
    ) {
        self.entries.insert(
            workspace_id.to_string(),
            WorkspaceKeyEntry {
                workspace_key,
                key_version,
            },
        );
    }

    pub fn rotate_workspace_key(
        &mut self,
        workspace_id: &str,
        workspace_key: [u8; WORKSPACE_KEY_LEN],
        key_version: u32,
    ) -> bool {
        if let Some(existing) = self.entries.get(workspace_id) {
            if key_version <= existing.key_version {
                return false;
            }
        }
        self.set_workspace_key(workspace_id, workspace_key, key_version);
        true
    }

    pub fn get(&self, workspace_id: &str) -> Option<&WorkspaceKeyEntry> {
        self.entries.get(workspace_id)
    }

    pub fn resolve_workspace_material(
        &self,
        workspace_id: Option<&str>,
        local_device_id: &str,
        peer_device_id: &str,
    ) -> Result<([u8; WORKSPACE_KEY_LEN], String, u32), String> {
        if let Some(workspace_id) = workspace_id {
            if let Some(entry) = self.get(workspace_id) {
                return Ok((
                    entry.workspace_key,
                    workspace_id.to_string(),
                    entry.key_version,
                ));
            }
            return Err(format!(
                "Workspace key not configured for workspace {workspace_id}"
            ));
        }

        let workspace_scope = format!("pairwise:{local_device_id}:{peer_device_id}");
        let bootstrap = derive_pairwise_bootstrap_key(local_device_id, peer_device_id);
        Ok((bootstrap, workspace_scope, 1))
    }
}
