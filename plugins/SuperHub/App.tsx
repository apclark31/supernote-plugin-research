import React, {useState, useEffect, useCallback} from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  NativeModules,
  ActivityIndicator,
} from 'react-native';
import {PluginManager, PluginCommAPI, PluginFileAPI, FileUtils} from 'sn-plugin-lib';

const debug = require('./src/utils/debug');

const {NoteOpener} = NativeModules;

type Screen = 'browser' | 'config';

const ROOT_PATH = '/storage/emulated/0';
const NOTE_HOME = `${ROOT_PATH}/Note`;

type FileEntry = {
  path: string;
  name: string;
  isDirectory: boolean;
  lastModified: number;
  size: number;
};

type SortMode = 'name' | 'modified';

function formatDate(timestamp: number): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDisplayName(name: string): string {
  if (name.endsWith('.note')) return name.slice(0, -5);
  if (name.endsWith('.pdf')) return name.slice(0, -4);
  return name;
}

function getFileType(name: string): string {
  if (name.endsWith('.note')) return 'NOTE';
  if (name.endsWith('.pdf')) return 'PDF';
  return '';
}

function ConfigScreen({onClose}: {onClose: () => void}): React.JSX.Element {
  const [logs, setLogs] = useState<string[]>(debug.getLogs());
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    debug.setListener((updated: string[]) => setLogs([...updated]));
    return () => debug.setListener(null);
  }, []);

  const handleUpload = async () => {
    setUploading(true);
    await debug.uploadLogs();
    setUploading(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.configTitle}>SuperHub Debug</Text>
        <View style={styles.headerRight}>
          <Pressable style={styles.newNoteButton} onPress={handleUpload} disabled={uploading}>
            <Text style={styles.newNoteText}>{uploading ? '...' : 'Upload'}</Text>
          </Pressable>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>X</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView style={styles.list}>
        {logs.map((line, i) => (
          <Text key={i} style={styles.logLine}>{line}</Text>
        ))}
        {logs.length === 0 && (
          <Text style={styles.emptyText}>No logs yet</Text>
        )}
      </ScrollView>
    </View>
  );
}

function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('browser');
  const [currentPath, setCurrentPath] = useState(NOTE_HOME);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('modified');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const pending = global.__superHubButtonId;
    global.__superHubButtonId = null;
    if (pending === 'config') {
      setScreen('config');
    }
  }, []);

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    debug.log('browser', `Loading: ${dirPath}`);

    try {
      const rawFiles = await FileUtils.listFiles(dirPath);
      debug.log('browser', `listFiles type: ${typeof rawFiles}, isArray: ${Array.isArray(rawFiles)}`);
      debug.log('browser', `listFiles first item: ${JSON.stringify(rawFiles?.[0])?.slice(0, 200)}`);

      if (!rawFiles || !Array.isArray(rawFiles) || rawFiles.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      const paths: string[] = rawFiles.map((item: any) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && item.path) return item.path;
        return String(item);
      });

      debug.log('browser', `Extracted ${paths.length} paths, first: ${paths[0]}`);

      const stats = await NoteOpener.getFileStats(paths);
      const fileEntries: FileEntry[] = stats.map((stat: any) => ({
        path: stat.path,
        name: stat.path.split('/').pop() || '',
        isDirectory: stat.isDirectory,
        lastModified: stat.lastModified,
        size: stat.size,
      }));

      setEntries(fileEntries);
      debug.log('browser', `Loaded ${fileEntries.length} items`);
    } catch (e: any) {
      debug.log('browser', `Error: ${e.message}`);
      setError(e.message);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  const sortedEntries = React.useMemo(() => {
    const folders = entries.filter(e => e.isDirectory);
    const files = entries.filter(e => !e.isDirectory);

    const sortFn =
      sortMode === 'modified'
        ? (a: FileEntry, b: FileEntry) => b.lastModified - a.lastModified
        : (a: FileEntry, b: FileEntry) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase());

    folders.sort(sortFn);
    files.sort(sortFn);

    return [...folders, ...files];
  }, [entries, sortMode]);

  const handlePress = useCallback(
    async (entry: FileEntry) => {
      if (entry.isDirectory) {
        setCurrentPath(entry.path);
        return;
      }

      const name = entry.name.toLowerCase();
      try {
        if (name.endsWith('.note')) {
          await NoteOpener.openNote(entry.path, 0);
        } else if (name.endsWith('.pdf')) {
          await NoteOpener.openDocument(entry.path, 0);
        }
        setTimeout(() => PluginManager.closePluginView(), 150);
      } catch (e: any) {
        debug.log('browser', `Open failed: ${e.message}`);
      }
    },
    [],
  );

  const navigateUp = useCallback(() => {
    if (currentPath === ROOT_PATH) return;
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/'));
    setCurrentPath(parent || ROOT_PATH);
  }, [currentPath]);

  const handleNewNote = useCallback(async () => {
    setCreating(true);
    debug.log('browser', 'Creating new note');

    try {
      const templates: any[] | null = await PluginCommAPI.getNoteSystemTemplates();
      debug.log('browser', `Templates: ${JSON.stringify(templates)?.slice(0, 200)}`);
      if (!templates || !templates.length) {
        debug.log('browser', 'No system templates available');
        setCreating(false);
        return;
      }

      const template = templates[0];
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const noteName = `${dateStr}.note`;
      const notePath = `${currentPath}/${noteName}`;

      const exists = await FileUtils.exists(notePath);
      if (exists) {
        debug.log('browser', `Note already exists: ${notePath}`);
        await NoteOpener.openNote(notePath, 0);
        setTimeout(() => PluginManager.closePluginView(), 150);
        setCreating(false);
        return;
      }

      const createResult = await PluginFileAPI.createNote({
        notePath,
        template: template.name,
        mode: 0,
        isPortrait: true,
      });
      debug.log('browser', `createNote result: ${JSON.stringify(createResult)}`);

      debug.log('browser', `Created: ${notePath}`);
      await NoteOpener.openNote(notePath, 1);
      setTimeout(() => PluginManager.closePluginView(), 150);
    } catch (e: any) {
      debug.log('browser', `New note error: ${e.message}`);
    } finally {
      setCreating(false);
    }
  }, [currentPath]);

  const handleClose = () => {
    PluginManager.closePluginView();
  };

  if (screen === 'config') {
    return <ConfigScreen onClose={handleClose} />;
  }

  const pathSegments = React.useMemo(() => {
    const relative = currentPath.replace(ROOT_PATH, '');
    if (!relative) return [{name: '/', path: ROOT_PATH}];
    const parts = relative.split('/').filter(Boolean);
    return [
      {name: '/', path: ROOT_PATH},
      ...parts.map((part, i) => ({
        name: part,
        path: ROOT_PATH + '/' + parts.slice(0, i + 1).join('/'),
      })),
    ];
  }, [currentPath]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {currentPath !== ROOT_PATH && (
            <Pressable style={styles.backButton} onPress={navigateUp}>
              <Text style={styles.backText}>{'<'}</Text>
            </Pressable>
          )}
          <View style={styles.breadcrumb}>
            {pathSegments.map((seg, i) => (
              <React.Fragment key={seg.path}>
                {i > 0 && <Text style={styles.breadcrumbSep}>/</Text>}
                <Pressable
                  onPress={() => setCurrentPath(seg.path)}
                  disabled={seg.path === currentPath}>
                  <Text
                    style={[
                      styles.breadcrumbText,
                      seg.path === currentPath && styles.breadcrumbCurrent,
                    ]}>
                    {seg.name}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.newNoteButton}
            onPress={handleNewNote}
            disabled={creating}>
            <Text style={styles.newNoteText}>
              {creating ? '...' : '+ Note'}
            </Text>
          </Pressable>
          <Pressable style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeText}>X</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.columnHeader}>
        <Pressable
          style={styles.colName}
          onPress={() => setSortMode('name')}>
          <Text style={styles.colHeaderText}>
            Name{sortMode === 'name' ? ' ▼' : ''}
          </Text>
        </Pressable>
        <Pressable
          style={styles.colDate}
          onPress={() => setSortMode('modified')}>
          <Text style={[styles.colHeaderText, styles.colHeaderRight]}>
            Modified{sortMode === 'modified' ? ' ▼' : ''}
          </Text>
        </Pressable>
        <View style={styles.colSize}>
          <Text style={[styles.colHeaderText, styles.colHeaderRight]}>Size</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000000" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : sortedEntries.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Empty folder</Text>
        </View>
      ) : (
        <ScrollView style={styles.list}>
          {sortedEntries.map(entry => (
            <Pressable
              key={entry.path}
              style={styles.row}
              onPress={() => handlePress(entry)}>
              <View style={styles.colName}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>
                    {entry.isDirectory ? 'DIR' : getFileType(entry.name)}
                  </Text>
                </View>
                <Text style={styles.fileName} numberOfLines={1}>
                  {entry.isDirectory ? entry.name : getDisplayName(entry.name)}
                </Text>
              </View>
              <Text style={[styles.colText, styles.colDate]}>
                {formatDate(entry.lastModified)}
              </Text>
              <Text style={[styles.colText, styles.colSize]}>
                {entry.isDirectory ? '--' : formatSize(entry.size)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#000000',
  },
  backText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  breadcrumb: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  breadcrumbText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    textDecorationLine: 'underline',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  breadcrumbCurrent: {
    textDecorationLine: 'none',
    color: '#444444',
  },
  breadcrumbSep: {
    fontSize: 16,
    color: '#666666',
    marginHorizontal: 2,
  },
  newNoteButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#000000',
  },
  newNoteText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  closeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#000000',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  configTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  logLine: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#000000',
  },
  emptyText: {
    fontSize: 16,
    color: '#666666',
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  colHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  colHeaderRight: {
    textAlign: 'right',
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
    minHeight: 56,
  },
  colName: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colDate: {
    width: 100,
    textAlign: 'right',
  },
  colSize: {
    width: 70,
    textAlign: 'right',
  },
  typeBadge: {
    width: 44,
    height: 24,
    borderWidth: 1,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000000',
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    flex: 1,
  },
  colText: {
    fontSize: 14,
    color: '#444444',
  },
});

export default App;
