/**
 * ProjectView - Single project drill-down
 *
 * Shows all tasks for one project, grouped by:
 * Overdue > Today > Upcoming > No Date
 */

import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {closePlugin} from '../utils/closePlugin';
import {loadConfig} from '../utils/config';
import {setConfigLoader, getTasksByProject} from '../api/todoist';
import {log, logError} from '../utils/debug';
import TaskRow from '../components/TaskRow';
import SectionHeader from '../components/SectionHeader';
import SelectionBar from '../components/SelectionBar';
import {useTaskSelection} from '../utils/useTaskSelection';

type Nav = {
  push: (name: string, params?: Record<string, any>) => void;
  pop: () => void;
  resetTo: (name: string) => void;
  canGoBack: boolean;
};

type Props = {
  nav: Nav;
  projectId: string;
  projectName: string;
};

export default function ProjectView({nav, projectId, projectName}: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    setConfigLoader(loadConfig);

    try {
      log('ProjectView', `Fetching tasks for project ${projectId}`);
      const result = await getTasksByProject(projectId);
      setTasks(result || []);
      log('ProjectView', `Got ${result?.length ?? 0} tasks`);
    } catch (err: any) {
      logError('ProjectView', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    log('ProjectView', `MOUNT projectId=${projectId} projectName="${projectName}"`);
    fetchTasks();
  }, [fetchTasks]);

  // F-025 v2 / F-043: checkbox taps SELECT; completion commits from the
  // contextual header (SelectionBar swaps into the header band).
  const sel = useTaskSelection('ProjectView', {
    onCompleted: ids => setTasks(prev => prev.filter(t => !ids.includes(t.id))),
    onUndone: () => fetchTasks(),
    onError: msg => setError(msg),
  });

  const handleTaskPress = (task: any) => {
    log('ProjectView', `TASK pressed id=${task.id} content="${task.content?.slice(0, 30)}"`);
    nav.push('task-detail', {task, projects: []});
  };

  const today = new Date().toISOString().slice(0, 10);

  const buildSections = (): any[] => {
    const overdue = tasks.filter(t => t.due?.date && t.due.date < today);
    const todayTasks = tasks.filter(t => t.due?.date === today);
    const upcoming = tasks
      .filter(t => t.due?.date && t.due.date > today)
      .sort((a, b) => a.due.date.localeCompare(b.due.date));
    const noDate = tasks.filter(t => !t.due?.date);

    const items: any[] = [];

    if (overdue.length) {
      items.push({key: 'header-overdue', type: 'header', title: 'Overdue', count: overdue.length});
      overdue.forEach(t => items.push({key: t.id, type: 'task', task: t}));
    }
    if (todayTasks.length) {
      items.push({key: 'header-today', type: 'header', title: 'Today', count: todayTasks.length});
      todayTasks.forEach(t => items.push({key: t.id, type: 'task', task: t}));
    }
    if (upcoming.length) {
      items.push({key: 'header-upcoming', type: 'header', title: 'Upcoming', count: upcoming.length});
      upcoming.forEach(t => items.push({key: t.id, type: 'task', task: t}));
    }
    if (noDate.length) {
      items.push({key: 'header-nodate', type: 'header', title: 'No Date', count: noDate.length});
      noDate.forEach(t => items.push({key: t.id, type: 'task', task: t}));
    }

    return items;
  };

  const sections = loading ? [] : buildSections();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => { log('ProjectView', 'BACK pressed'); nav.canGoBack ? nav.pop() : nav.resetTo('task-home'); }}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </Pressable>
        {/* F-025 v2 / F-043: header content swaps to the contextual action
            bar while selecting -- band geometry fixed, Back always present. */}
        {sel.active ? (
          <SelectionBar
            count={sel.selectedIds.length}
            undoCount={sel.undoIds.length}
            busy={sel.busy}
            onComplete={sel.completeSelected}
            onClear={sel.clearSelection}
            onUndo={sel.undo}
            onDismiss={sel.dismissUndo}
          />
        ) : (
          <>
            <Text style={styles.title} numberOfLines={1}>{projectName}</Text>
            <View style={styles.headerButtons}>
              <Pressable
                style={styles.headerButton}
                onPress={() => { log('ProjectView', 'ADD pressed'); nav.push('task-add', {projects: [], defaultProjectId: projectId}); }}>
                <Text style={styles.headerButtonText}>+</Text>
              </Pressable>
              <Pressable style={styles.headerButton} onPress={() => closePlugin()}>
                <Text style={styles.headerButtonText}>Close</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No tasks in this project</Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={item => item.key}
          renderItem={({item}) => {
            if (item.type === 'header') {
              return <SectionHeader title={item.title} count={item.count} />;
            }
            return (
              <TaskRow
                task={item.task}
                selected={sel.selectedIds.includes(item.task.id)}
                onCheckPress={sel.toggleSelect}
                onPress={handleTaskPress}
              />
            );
          }}
          ItemSeparatorComponent={({leadingItem}) =>
            leadingItem?.type !== 'header' ? <View style={styles.separator} /> : null
          }
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </Text>
        <Pressable onPress={() => { sel.clearSelection(); fetchTasks(); }}>
          <Text style={styles.footerRefresh}>Refresh</Text>
        </Pressable>
      </View>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    gap: 12,
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666666',
  },
  errorText: {
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#666666',
  },
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginLeft: 62,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#000000',
  },
  footerText: {
    fontSize: 13,
    color: '#666666',
  },
  footerRefresh: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
});
