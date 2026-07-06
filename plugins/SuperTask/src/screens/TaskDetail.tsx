/**
 * TaskDetail - View/edit/complete/delete a task
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {PluginCommAPI, PluginManager} from 'sn-plugin-lib';
import {closePlugin} from '../utils/closePlugin';
import {loadConfig} from '../utils/config';
import {openNote} from '../utils/noteOpener';
import {setConfigLoader, updateTask, completeTask, deleteTask} from '../api/todoist';
import {log, logError} from '../utils/debug';
import PriorityPicker from '../components/PriorityPicker';
import ProjectPicker from '../components/ProjectPicker';
import DatePicker from '../components/DatePicker';

type Nav = {
  push: (name: string, params?: Record<string, any>) => void;
  pop: () => void;
  resetTo: (name: string) => void;
  canGoBack: boolean;
};

type Props = {
  nav: Nav;
  task: any;
  projects: any[];
};

// Parse note context from description: "[SuperTask] Captured from: {path} p.{N}"
// Supports both full path (/storage/.../file.note) and legacy filename-only (file.note)
function parseNoteContext(desc: string): {notePath: string; noteFile: string; pageNum: number; userDescription: string} | null {
  if (!desc) return null;
  const match = desc.match(/\[SuperTask\] Captured from: (.+\.note) p\.(\d+)/);
  if (!match) return null;
  const userDescription = desc.replace(/\n*---\n\[SuperTask\] Captured from: .+$/, '').trim();
  const raw = match[1];
  const isFullPath = raw.startsWith('/');
  return {
    notePath: isFullPath ? raw : '',  // empty = legacy, must resolve
    noteFile: raw.split('/').pop() || raw,
    pageNum: parseInt(match[2], 10),
    userDescription,
  };
}

export default function TaskDetail({nav, task, projects}: Props) {
  const [content, setContent] = useState(task?.content || '');
  const rawDescription = task?.description || '';
  const [noteContext] = useState(() => parseNoteContext(rawDescription));
  const [description, setDescription] = useState(noteContext ? noteContext.userDescription : rawDescription);
  const [priority, setPriority] = useState(task?.priority || 1);
  const [dueString, setDueString] = useState(task?.due?.string || task?.due?.date || '');
  const [projectId, setProjectId] = useState(task?.project_id || null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [viewNoteStatus, setViewNoteStatus] = useState('');

  const handleViewNote = async () => {
    if (!noteContext) return;
    log('TaskDetail', `VIEW NOTE pressed: ${noteContext.noteFile} p.${noteContext.pageNum}`);
    setViewNoteStatus('Checking...');

    try {
      const fp = await PluginCommAPI.getCurrentFilePath();
      const currentPath = fp?.result || '';
      const currentFile = currentPath.split('/').pop() || '';

      // Use full path if available, otherwise guess same directory (legacy tasks)
      const targetPath = noteContext.notePath
        || (currentFile === noteContext.noteFile
          ? currentPath
          : currentPath.substring(0, currentPath.lastIndexOf('/') + 1) + noteContext.noteFile);

      setViewNoteStatus('Opening note...');

      // Page is stored 0-based in noteContext, intent expects 1-based
      const intentPage = (noteContext.pageNum || 0) + 1;
      log('TaskDetail', `${currentFile === noteContext.noteFile ? 'Same' : 'Different'} note. Opening ${targetPath} p.${intentPage}`);
      const result = await openNote(targetPath, intentPage);

      if (!result.success) {
        log('TaskDetail', `openNote failed: ${result.error}`);
        setViewNoteStatus(`Error: ${result.error}`);
        return;
      }

      log('TaskDetail', `Navigated to ${targetPath} p.${intentPage}`);
    } catch (e: any) {
      logError('TaskDetail', e);
      setViewNoteStatus(`Error: ${e.message}`);
    }
  };

  useEffect(() => {
    log('TaskDetail', `MOUNT task=${task?.id} content="${task?.content}" projects=${projects?.length}`);
    log('TaskDetail', `noteContext: ${noteContext ? `${noteContext.noteFile} p.${noteContext.pageNum}` : 'none'}`);
    setConfigLoader(loadConfig);
  }, []);

  const isDirty =
    content !== (task.content || '') ||
    description !== (task.description || '') ||
    priority !== (task.priority || 1) ||
    dueString !== (task.due?.string || task.due?.date || '') ||
    projectId !== (task.project_id || null);

  const handleSave = async () => {
    log('TaskDetail', `SAVE pressed. isDirty=${isDirty} saving=${saving} content="${content}"`);
    if (!content.trim()) {
      setStatus('Task title cannot be empty');
      return;
    }

    setSaving(true);
    setStatus('Saving...');

    try {
      // Re-append note context metadata if it existed
      let fullDescription = description.trim();
      if (noteContext) {
        const pathOrFile = noteContext.notePath || noteContext.noteFile;
        const noteRef = `\n\n---\n[SuperTask] Captured from: ${pathOrFile} p.${noteContext.pageNum}`;
        fullDescription = fullDescription ? fullDescription + noteRef : noteRef.trim();
      }

      await updateTask(task.id, {
        content: content.trim(),
        description: fullDescription,
        priority,
        dueString: dueString.trim() || undefined,
        projectId: projectId || undefined,
      });
      log('TaskDetail', `Updated task ${task.id}`);
      // Update the task reference so isDirty resets
      task.content = content.trim();
      task.description = fullDescription;
      task.priority = priority;
      task.due = dueString.trim() ? {...(task.due || {}), string: dueString.trim()} : task.due;
      task.project_id = projectId;
      setStatus('Saved');
      setTimeout(() => setStatus(''), 1500);
    } catch (err: any) {
      logError('TaskDetail', err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    log('TaskDetail', `COMPLETE pressed. taskId=${task?.id}`);
    setSaving(true);
    setStatus('Completing...');
    try {
      await completeTask(task.id);
      log('TaskDetail', `Completed task ${task.id}`);
      setStatus('Done!');
      setTimeout(() => nav.pop(), 500);
    } catch (err: any) {
      logError('TaskDetail', err);
      setStatus(`Error: ${err.message}`);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    log('TaskDetail', `DELETE pressed. confirmDelete=${confirmDelete}`);
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setSaving(true);
    setStatus('Deleting...');
    try {
      await deleteTask(task.id);
      log('TaskDetail', `Deleted task ${task.id}`);
      setStatus('Deleted');
      setTimeout(() => nav.pop(), 500);
    } catch (err: any) {
      logError('TaskDetail', err);
      setStatus(`Error: ${err.message}`);
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrapper}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={() => {
          if (nav.canGoBack) {
            log('TaskDetail', 'BACK pressed');
            nav.pop();
          } else {
            log('TaskDetail', 'BACK pressed (deep link) -- closing plugin');
            closePlugin();
          }
        }}>
          <Text style={styles.backText}>{nav.canGoBack ? '< Back' : '< Note'}</Text>
        </Pressable>
        {!nav.canGoBack ? (
          <Pressable onPress={() => { log('TaskDetail', 'All Tasks pressed'); nav.resetTo('task-home'); }}>
            <Text style={styles.headerTitleLink}>All Tasks</Text>
          </Pressable>
        ) : (
          <Text style={styles.headerTitle}>Edit Task</Text>
        )}
        <Pressable onPress={handleDelete}>
          <Text style={styles.deleteText}>
            {confirmDelete ? 'Confirm Delete' : 'Delete'}
          </Text>
        </Pressable>
      </View>

      {noteContext && (
        <View style={styles.noteContext}>
          <View style={styles.noteContextRow}>
            <View style={{flex: 1}}>
              <Text style={styles.noteContextLabel}>Captured from</Text>
              <Text style={styles.noteContextValue}>
                {noteContext.noteFile.replace('.note', '')} — page {noteContext.pageNum}
              </Text>
            </View>
            <Pressable style={styles.viewNoteBtn} onPress={handleViewNote}>
              <Text style={styles.viewNoteBtnText}>View Note</Text>
            </Pressable>
          </View>
          {viewNoteStatus ? (
            <Text style={styles.viewNoteStatus}>{viewNoteStatus}</Text>
          ) : null}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Task</Text>
        <TextInput
          style={styles.input}
          value={content}
          onChangeText={(t) => { log('TaskDetail', `content changed: "${t.slice(0, 30)}"`); setContent(t); }}
          onFocus={() => log('TaskDetail', 'content FOCUSED')}
          placeholder="Task title"
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={description}
          onChangeText={(t) => { log('TaskDetail', 'description changed'); setDescription(t); }}
          onFocus={() => log('TaskDetail', 'description FOCUSED')}
          placeholder="Optional notes"
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Due Date</Text>
        <Pressable
          style={styles.input}
          onPress={() => { log('TaskDetail', 'DUE DATE pressed'); setShowDatePicker(true); }}>
          <Text style={dueString ? styles.inputValue : styles.inputPlaceholder}>
            {dueString || 'Tap to pick a date'}
          </Text>
        </Pressable>
        {showDatePicker && (
          <View style={styles.datePickerWrap}>
            <DatePicker
              value={dueString}
              onChange={(date) => { log('TaskDetail', `date selected: ${date}`); setDueString(date); }}
              onClose={() => setShowDatePicker(false)}
            />
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Priority</Text>
        <PriorityPicker value={priority} onChange={(p) => { log('TaskDetail', `priority changed: ${p}`); setPriority(p); }} />
      </View>

      {projects.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>Project</Text>
          <ProjectPicker
            projects={projects}
            selectedId={projectId}
            onChange={(id) => { log('TaskDetail', `project changed: ${id}`); setProjectId(id); }}
          />
        </View>
      )}

      <Pressable
        style={[styles.completeButton]}
        onPress={handleComplete}
        disabled={saving}>
        <Text style={styles.completeText}>Mark Complete</Text>
      </Pressable>

      <Pressable
        style={[styles.saveButton, (!isDirty || saving) && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={!isDirty || saving}>
        <Text style={[styles.saveText, (!isDirty || saving) && styles.saveTextDisabled]}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Text>
      </Pressable>

    </ScrollView>
    {status ? (
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>{status}</Text>
      </View>
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  headerTitleLink: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    textDecorationLine: 'underline',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  noteContext: {
    borderWidth: 1,
    borderColor: '#000000',
    borderStyle: 'dashed',
    borderRadius: 4,
    padding: 12,
    marginBottom: 20,
  },
  noteContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noteContextLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 4,
  },
  noteContextValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  viewNoteBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    marginLeft: 12,
  },
  viewNoteBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  viewNoteStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000000',
    marginTop: 8,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    color: '#000000',
  },
  inputValue: {
    fontSize: 16,
    color: '#000000',
  },
  inputPlaceholder: {
    fontSize: 16,
    color: '#999999',
  },
  datePickerWrap: {
    marginTop: 8,
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  completeButton: {
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 12,
  },
  completeText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  saveButton: {
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    alignItems: 'center',
    backgroundColor: '#000000',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#ffffff',
    borderColor: '#cccccc',
  },
  saveText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  saveTextDisabled: {
    color: '#cccccc',
  },
  overlay: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    padding: 14,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  overlayText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
});
