/**
 * TaskHome - Tabbed task viewer (Today / Upcoming / Projects)
 *
 * Replaces the old flat TaskList screen with grouped, navigable views.
 */

import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
} from 'react-native';
import {PluginManager, PluginCommAPI, PluginFileAPI} from 'sn-plugin-lib';
import {closePlugin} from '../utils/closePlugin';
import {getTasksForPage, getAllTasks as getAllRegistryTasks, removeTask} from '../utils/taskRegistry';
import {loadConfig} from '../utils/config';
import {completeTask} from '../api/todoist';
import {getCache, fetchTaskData, invalidateCache} from '../cache/taskCache';
import {log, logError} from '../utils/debug';
import TabBar from '../components/TabBar';
import TaskRow from '../components/TaskRow';
import SectionHeader from '../components/SectionHeader';

type Nav = {
  push: (name: string, params?: Record<string, any>) => void;
  pop: () => void;
  resetTo: (name: string) => void;
  canGoBack: boolean;
};

type Props = {
  nav: Nav;
};

const TABS = [
  {key: 'today', label: 'Today'},
  {key: 'upcoming', label: 'Upcoming'},
  {key: 'projects', label: 'Projects'},
  {key: 'device', label: 'Device'},
];

type ProjectMap = Record<string, string>;

export default function TaskHome({nav}: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [projectMap, setProjectMap] = useState<ProjectMap>({});
  const [projectList, setProjectList] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageRef, setPageRef] = useState('');
  const [pageTaskIds, setPageTaskIds] = useState<string[]>([]);
  const [registryPageTasks, setRegistryPageTasks] = useState<any[]>([]);
  const [deviceTasks, setDeviceTasks] = useState<any[]>([]);
  const [debugMode, setDebugMode] = useState(false);
  const [enabledProjectIds, setEnabledProjectIds] = useState<string[]>([]);

  // Load default tab from config and detect current page on mount
  useEffect(() => {
    loadConfig().then(config => {
      if (config.defaultTab) {
        log('TaskHome', `Setting default tab from config: ${config.defaultTab}`);
        setActiveTab(config.defaultTab);
      }
      if (config.debugMode) setDebugMode(true);
      if (config.enabledProjectIds?.length > 0) setEnabledProjectIds(config.enabledProjectIds);
    });

    // Detect current note/page, scan for supertask links, read registry
    (async () => {
      try {
        const fp = await PluginCommAPI.getCurrentFilePath();
        const pn = await PluginCommAPI.getCurrentPageNum();
        const filePath = fp?.result || '';
        const pageNum = pn?.result ?? 0;
        if (!filePath) return;

        const fileName = filePath.split('/').pop()?.replace('.note', '') || '';
        const noteFile = filePath.split('/').pop() || '';
        const ref = `From: ${fileName} p.${pageNum}`;
        setPageRef(ref);
        log('TaskHome', `Page context: ${ref}`);

        // Scan page elements for supertask:// links
        try {
          const elemResult = await PluginFileAPI.getElements(pageNum, filePath);
          if (elemResult?.success && elemResult.result) {
            const linkElements = elemResult.result.filter(
              (el: any) => el.type === 600 && el.link?.destPath?.startsWith('supertask://task/')
            );
            const ids = linkElements.map((el: any) => {
              const path = el.link.destPath;
              return path.replace('supertask://task/', '');
            });
            setPageTaskIds(ids);
            log('TaskHome', `Found ${ids.length} supertask links on page`);

            // Recycle elements to free native memory
            elemResult.result.forEach((el: any) => {
              if (el.recycle) el.recycle();
            });
          }
        } catch (e: any) {
          log('TaskHome', `Element scan failed: ${e.message}`);
        }

        // Read from local registry -- page tasks
        try {
          const regTasks = await getTasksForPage(noteFile, pageNum);
          setRegistryPageTasks(regTasks);
          log('TaskHome', `Registry: ${regTasks.length} tasks for this page`);
        } catch (e: any) {
          log('TaskHome', `Registry read failed: ${e.message}`);
        }
      } catch (e: any) {
        log('TaskHome', `Page context detection failed: ${e.message}`);
      }

      // Load all device tasks from registry (independent of page context)
      try {
        const allReg = await getAllRegistryTasks();
        setDeviceTasks(allReg);
        log('TaskHome', `Registry: ${allReg.length} total device tasks`);
      } catch (e: any) {
        log('TaskHome', `Device registry read failed: ${e.message}`);
      }
    })();
  }, []);

  // Apply fetched data to component state
  const applyData = useCallback((fetchedTasks: any[], fetchedProjects: any[]) => {
    const pMap: ProjectMap = {};
    (fetchedProjects || []).forEach((p: any) => { pMap[p.id] = p.name; });
    setProjectMap(pMap);
    setProjectList(fetchedProjects || []);
    setTasks(fetchedTasks || []);
  }, []);

  // Reconcile registry: remove entries for tasks no longer in Todoist
  const reconcileRegistry = useCallback(async (fetchedTasks: any[]) => {
    try {
      const allReg = await getAllRegistryTasks();
      if (allReg.length > 0 && fetchedTasks && fetchedTasks.length > 0) {
        const apiIds = new Set(fetchedTasks.map((t: any) => t.id));
        const stale = allReg.filter((rt: any) => !apiIds.has(rt.id));
        if (stale.length > 0) {
          log('TaskHome', `Registry sync: removing ${stale.length} stale tasks (deleted/completed in Todoist)`);
          for (const s of stale) {
            await removeTask(s.id);
          }
          const refreshed = await getAllRegistryTasks();
          setDeviceTasks(refreshed);
          log('TaskHome', `Registry sync: ${refreshed.length} tasks remain`);
        }
      }
    } catch (syncErr: any) {
      log('TaskHome', `Registry sync failed (non-fatal): ${syncErr.message}`);
    }
  }, []);

  // Fetch via cache layer (used by Refresh button)
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await fetchTaskData();
      if (data) {
        applyData(data.tasks, data.projects);
        await reconcileRegistry(data.tasks);
        log('TaskHome', `Loaded ${data.tasks.length} tasks, ${data.projects.length} projects${silent ? ' (silent)' : ''}`);
      } else {
        setError('No API token. Use the config button to set it up.');
      }
    } catch (err: any) {
      logError('TaskHome', err);
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applyData, reconcileRegistry]);

  // Mount: serve cached data immediately, then refresh in background
  useEffect(() => {
    log('TaskHome', 'MOUNT');

    // Stale-while-revalidate: render from cache if available
    const cached = getCache();
    if (cached) {
      log('TaskHome', `Cache hit: ${cached.tasks.length} tasks (age: ${Date.now() - cached.timestamp}ms)`);
      applyData(cached.tasks, cached.projects);
      setLoading(false);
    }

    // Always fetch fresh data (deduplicates with any in-flight prefetch)
    fetchTaskData()
      .then(data => {
        if (data) {
          applyData(data.tasks, data.projects);
          reconcileRegistry(data.tasks);
          log('TaskHome', `Fresh data: ${data.tasks.length} tasks, ${data.projects.length} projects`);
        } else if (!cached) {
          setError('No API token. Use the config button to set it up.');
        }
        setLoading(false);
      })
      .catch(err => {
        logError('TaskHome', err);
        if (!cached) setError(err.message);
        setLoading(false);
      });
  }, [applyData, reconcileRegistry]);

  const handleComplete = async (taskId: string) => {
    log('TaskHome', `COMPLETE pressed taskId=${taskId}`);
    try {
      await completeTask(taskId);
      log('TaskHome', `COMPLETE success taskId=${taskId}`);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      invalidateCache();
    } catch (err: any) {
      logError('TaskHome', err);
      setError(`Complete failed: ${err.message}`);
    }
  };

  const handleTaskPress = (task: any) => {
    log('TaskHome', `TASK pressed id=${task.id} content="${task.content?.slice(0, 30)}"`);
    nav.push('task-detail', {task, projects: projectList});
  };

  const handleAddTask = async () => {
    log('TaskHome', 'ADD TASK pressed');
    const config = await loadConfig();
    nav.push('task-add', {projects: projectList, defaultProjectId: config.defaultProjectId});
  };

  const today = new Date().toISOString().slice(0, 10);

  // Tasks linked to the current note page.
  // Priority: match by supertask link IDs from element scan, then fall back
  // to description text match, then registry-only tasks (not yet in Todoist response).
  const pageTasks = (() => {
    const seen = new Set<string>();
    const result: any[] = [];

    // 1. Tasks whose IDs were found as supertask:// links on the page
    if (pageTaskIds.length > 0) {
      for (const id of pageTaskIds) {
        const match = tasks.find(t => t.id === id);
        if (match && !seen.has(match.id)) {
          seen.add(match.id);
          result.push(match);
        }
      }
    }

    // 2. Tasks matched by description back-reference (backward compat)
    if (pageRef) {
      for (const t of tasks) {
        if (!seen.has(t.id) && t.description && t.description.includes(pageRef)) {
          seen.add(t.id);
          result.push(t);
        }
      }
    }

    // 3. Registry-only tasks (created this session, may not be in Todoist response yet)
    for (const rt of registryPageTasks) {
      if (!seen.has(rt.id)) {
        seen.add(rt.id);
        result.push({id: rt.id, content: rt.content, _registryOnly: true});
      }
    }

    return result;
  })();

  const renderThisPage = () => {
    if (pageTasks.length === 0 || loading) return null;

    return (
      <View style={styles.thisPage}>
        <View style={styles.thisPageHeader}>
          <Text style={styles.thisPageTitle}>This Page</Text>
          <Text style={styles.thisPageCount}>{pageTasks.length}</Text>
        </View>
        {pageTasks.map((task, i) => (
          <View key={task.id}>
            {i > 0 && <View style={styles.thisPageSeparator} />}
            <TaskRow
              task={task}
              onComplete={handleComplete}
              onPress={handleTaskPress}
              showProject={projectMap[task.project_id]}
            />
          </View>
        ))}
      </View>
    );
  };

  // Build sections based on active tab
  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }

    if (activeTab === 'today') return renderTodayTab();
    if (activeTab === 'upcoming') return renderUpcomingTab();
    if (activeTab === 'device') return renderDeviceTab();
    return renderProjectsTab();
  };

  const renderTodayTab = () => {
    // Tasks due today or overdue, grouped by project
    const todayTasks = tasks.filter(t => {
      const due = t.due?.date;
      return due && due <= today;
    });

    if (todayTasks.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No tasks due today</Text>
        </View>
      );
    }

    // Group by project
    const groups = groupByProject(todayTasks, projectMap);

    return (
      <FlatList
        data={groups}
        keyExtractor={item => item.key}
        renderItem={({item}) => {
          if (item.type === 'header') {
            return (
              <SectionHeader
                title={item.title}
                count={item.count}
                onPress={() => nav.push('project-view', {
                  projectId: item.projectId,
                  projectName: item.title,
                })}
              />
            );
          }
          return (
            <TaskRow
              task={item.task}
              onComplete={handleComplete}
              onPress={handleTaskPress}
            />
          );
        }}
        ItemSeparatorComponent={({leadingItem}) =>
          leadingItem?.type !== 'header' ? <View style={styles.separator} /> : null
        }
      />
    );
  };

  const renderUpcomingTab = () => {
    // Tasks due after today, grouped by date bucket
    const upcoming = tasks
      .filter(t => {
        const due = t.due?.date;
        return due && due > today;
      })
      .sort((a, b) => (a.due?.date || '').localeCompare(b.due?.date || ''));

    const noDue = tasks.filter(t => !t.due?.date);

    if (upcoming.length === 0 && noDue.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No upcoming tasks</Text>
        </View>
      );
    }

    const buckets = groupByDateBucket(upcoming, today);
    if (noDue.length > 0) {
      buckets.push({key: 'header-nodate', type: 'header' as const, title: 'No Date', count: noDue.length});
      noDue.forEach(t => buckets.push({key: t.id, type: 'task' as const, task: t}));
    }

    return (
      <FlatList
        data={buckets}
        keyExtractor={item => item.key}
        renderItem={({item}) => {
          if (item.type === 'header') {
            return <SectionHeader title={item.title} count={item.count} />;
          }
          return (
            <TaskRow
              task={item.task}
              onComplete={handleComplete}
              onPress={handleTaskPress}
              showProject={projectMap[item.task.project_id]}
            />
          );
        }}
        ItemSeparatorComponent={({leadingItem}) =>
          leadingItem?.type !== 'header' ? <View style={styles.separator} /> : null
        }
      />
    );
  };

  const renderProjectsTab = () => {
    // List of projects with task counts
    const projectCounts: Record<string, number> = {};
    tasks.forEach(t => {
      const pid = t.project_id || 'none';
      projectCounts[pid] = (projectCounts[pid] || 0) + 1;
    });

    // If user selected specific projects in settings, show only those (even if empty)
    // Otherwise show all projects (even if empty)
    const filtered = enabledProjectIds.length > 0
      ? projectList.filter(p => enabledProjectIds.includes(p.id))
      : projectList;
    const items = filtered.map(p => ({...p, taskCount: projectCounts[p.id] || 0}));

    if (items.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No projects</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <Pressable
            style={styles.projectRow}
            onPress={() => nav.push('project-view', {
              projectId: item.id,
              projectName: item.name,
            })}>
            <Text style={styles.projectName}>{item.name}</Text>
            <View style={styles.projectMeta}>
              <Text style={styles.projectCount}>
                {item.taskCount} task{item.taskCount !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.projectArrow}>{'>'}</Text>
            </View>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    );
  };

  const renderDeviceTab = () => {
    if (deviceTasks.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No tasks captured on this device</Text>
        </View>
      );
    }

    // Group by noteFile
    const byNote: Record<string, any[]> = {};
    for (const dt of deviceTasks) {
      const key = dt.noteFile || 'Unknown';
      if (!byNote[key]) byNote[key] = [];
      byNote[key].push(dt);
    }

    // Build flat list with headers
    const items: any[] = [];
    for (const [noteFile, noteTasks] of Object.entries(byNote)) {
      const label = noteFile.replace('.note', '');
      items.push({type: 'header', key: `h-${noteFile}`, title: label, count: noteTasks.length});
      for (const dt of noteTasks) {
        // Try to find the full Todoist task for richer display
        const fullTask = tasks.find(t => t.id === dt.id);
        items.push({
          type: 'task',
          key: dt.id,
          task: fullTask || {id: dt.id, content: dt.content, _registryOnly: true},
          pageNum: dt.pageNum,
        });
      }
    }

    return (
      <FlatList
        data={items}
        keyExtractor={item => item.key}
        renderItem={({item}) => {
          if (item.type === 'header') {
            return <SectionHeader title={item.title} count={item.count} />;
          }
          return (
            <View style={styles.deviceTaskRow}>
              <View style={styles.deviceTaskPage}>
                <Text style={styles.deviceTaskPageText}>p.{item.pageNum}</Text>
              </View>
              <View style={{flex: 1}}>
                <TaskRow
                  task={item.task}
                  onComplete={handleComplete}
                  onPress={handleTaskPress}
                  showProject={projectMap[item.task.project_id]}
                />
              </View>
            </View>
          );
        }}
        ItemSeparatorComponent={({leadingItem}) =>
          leadingItem?.type !== 'header' ? <View style={styles.separator} /> : null
        }
      />
    );
  };

  const taskCount = tasks.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SuperTask</Text>
        <View style={styles.headerButtons}>
          <Pressable style={styles.headerButton} onPress={handleAddTask}>
            <Text style={styles.headerButtonText}>+</Text>
          </Pressable>
          <Pressable style={styles.headerButton} onPress={() => { log('TaskHome', 'SETTINGS pressed'); nav.push('config'); }}>
            <Text style={styles.headerButtonText}>Settings</Text>
          </Pressable>
          {debugMode && (
            <Pressable style={styles.headerButton} onPress={() => { log('TaskHome', 'LOG pressed'); nav.resetTo('debug'); }}>
              <Text style={styles.headerButtonText}>Log</Text>
            </Pressable>
          )}
          {debugMode && (
            <Pressable style={styles.headerButton} onPress={() => { log('TaskHome', 'DIAG pressed'); nav.push('diagnostics'); }}>
              <Text style={styles.headerButtonText}>Diag</Text>
            </Pressable>
          )}
          <Pressable style={styles.headerButton} onPress={() => { log('TaskHome', 'CLOSE pressed'); closePlugin(); }}>
            <Text style={styles.headerButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={(tab) => { log('TaskHome', `TAB changed: ${tab}`); setActiveTab(tab); }} />

      {renderThisPage()}

      <View style={styles.body}>
        {renderContent()}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </Text>
        <Pressable onPress={() => fetchData(true)}>
          <Text style={styles.footerRefresh}>Refresh</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Group tasks by project, returning interleaved header + task items
function groupByProject(tasks: any[], projectMap: Record<string, string>): any[] {
  const groups: Record<string, any[]> = {};

  tasks.forEach(t => {
    const pid = t.project_id || 'inbox';
    if (!groups[pid]) groups[pid] = [];
    groups[pid].push(t);
  });

  const items: any[] = [];
  Object.entries(groups).forEach(([pid, projectTasks]) => {
    items.push({
      key: `header-${pid}`,
      type: 'header',
      title: projectMap[pid] || 'Inbox',
      count: projectTasks.length,
      projectId: pid,
    });
    projectTasks
      .sort((a, b) => (a.due?.date || '').localeCompare(b.due?.date || ''))
      .forEach(t => items.push({key: t.id, type: 'task', task: t}));
  });

  return items;
}

// Group tasks into date buckets: Tomorrow, This Week, Later
function groupByDateBucket(tasks: any[], today: string): any[] {
  const todayDate = new Date(today + 'T00:00:00');
  const tomorrow = new Date(todayDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  // End of this week (Sunday)
  const endOfWeek = new Date(todayDate);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  const endOfWeekStr = endOfWeek.toISOString().slice(0, 10);

  const buckets: {tomorrow: any[]; thisWeek: any[]; later: any[]} = {
    tomorrow: [],
    thisWeek: [],
    later: [],
  };

  tasks.forEach(t => {
    const due = t.due?.date;
    if (due === tomorrowStr) {
      buckets.tomorrow.push(t);
    } else if (due <= endOfWeekStr) {
      buckets.thisWeek.push(t);
    } else {
      buckets.later.push(t);
    }
  });

  const items: any[] = [];
  if (buckets.tomorrow.length) {
    items.push({key: 'header-tomorrow', type: 'header', title: 'Tomorrow', count: buckets.tomorrow.length});
    buckets.tomorrow.forEach(t => items.push({key: t.id, type: 'task', task: t}));
  }
  if (buckets.thisWeek.length) {
    items.push({key: 'header-thisweek', type: 'header', title: 'This Week', count: buckets.thisWeek.length});
    buckets.thisWeek.forEach(t => items.push({key: t.id, type: 'task', task: t}));
  }
  if (buckets.later.length) {
    items.push({key: 'header-later', type: 'header', title: 'Later', count: buckets.later.length});
    buckets.later.forEach(t => items.push({key: t.id, type: 'task', task: t}));
  }

  return items;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  title: {
    fontSize: 22,
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
  thisPage: {
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    backgroundColor: '#f8f8f8',
  },
  thisPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  thisPageTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  thisPageCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  thisPageSeparator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginLeft: 62,
  },
  body: {
    flex: 1,
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
  projectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  projectName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  projectMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectCount: {
    fontSize: 14,
    color: '#666666',
  },
  projectArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  deviceTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceTaskPage: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceTaskPageText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666666',
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
