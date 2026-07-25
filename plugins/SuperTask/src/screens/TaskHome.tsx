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
import {getTasksForNote, getAllTasks as getAllRegistryTasks, removeTask} from '../utils/taskRegistry';
import {openNote} from '../utils/noteOpener';
import {healRenamedNotes} from '../utils/noteHeal';
import {loadConfig} from '../utils/config';
import {completeTask, reopenTask, getCompletedTasks} from '../api/todoist';
import {getCache, fetchTaskData, invalidateCache} from '../cache/taskCache';
import {log, logError} from '../utils/debug';
import TabBar from '../components/TabBar';
import TaskRow from '../components/TaskRow';
import SectionHeader from '../components/SectionHeader';
import Chip from '../components/Chip';

type Nav = {
  push: (name: string, params?: Record<string, any>) => void;
  pop: () => void;
  resetTo: (name: string) => void;
  canGoBack: boolean;
};

type Props = {
  nav: Nav;
  focusTab?: string; // deep-link target tab; overrides the config default
};

const TABS = [
  {key: 'today', label: 'Today'},
  {key: 'upcoming', label: 'Upcoming'},
  {key: 'projects', label: 'Projects'},
  {key: 'device', label: 'On Device'},
  {key: 'done', label: 'Done'},
];

const TAB_KEYS = TABS.map(t => t.key);

type ProjectMap = Record<string, string>;

export default function TaskHome({nav, focusTab}: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [projectMap, setProjectMap] = useState<ProjectMap>({});
  const [projectList, setProjectList] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState(
    focusTab && TAB_KEYS.includes(focusTab) ? focusTab : 'today',
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noteCtx, setNoteCtx] = useState<{fileName: string; pageNum: number; filePath: string} | null>(null);
  const [pageTaskIds, setPageTaskIds] = useState<string[]>([]);
  const [registryNoteTasks, setRegistryNoteTasks] = useState<any[]>([]);
  const [deviceTasks, setDeviceTasks] = useState<any[]>([]);
  const [enabledProjectIds, setEnabledProjectIds] = useState<string[]>([]);

  // Done tab: fetched lazily on first visit (separate endpoint, not part of
  // the main cache -- completed history changes rarely and can be large)
  const [doneTasks, setDoneTasks] = useState<any[]>([]);
  const [doneLoading, setDoneLoading] = useState(false);
  const [doneError, setDoneError] = useState('');
  const [doneFetched, setDoneFetched] = useState(false);

  // Load default tab from config and detect current page on mount
  useEffect(() => {
    loadConfig().then(config => {
      // An explicit deep-link focusTab wins over the config default
      if (!focusTab && config.defaultTab && TAB_KEYS.includes(config.defaultTab)) {
        log('TaskHome', `Setting default tab from config: ${config.defaultTab}`);
        setActiveTab(config.defaultTab);
      }
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
        setNoteCtx({fileName, pageNum, filePath});
        log('TaskHome', `Note context: ${fileName} p.${pageNum}`);

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

        // Read from local registry -- ALL tasks in this note (any page),
        // so the This Note band shows where each one lives in a long note
        try {
          const regTasks = await getTasksForNote(noteFile);
          setRegistryNoteTasks(regTasks);
          log('TaskHome', `Registry: ${regTasks.length} tasks in this note`);
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

  // Reconcile registry: remove entries for tasks no longer in Todoist,
  // then heal any note renames (B-005, once per session, fire-and-forget)
  const reconcileRegistry = useCallback(async (fetchedTasks: any[]) => {
    healRenamedNotes(fetchedTasks)
      .then(healedCount => {
        if (healedCount > 0) {
          // Refresh Device tab data so healed paths/labels show immediately
          getAllRegistryTasks().then(setDeviceTasks).catch(() => {});
        }
      })
      .catch(() => {});
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

  // Lazy-fetch completed tasks on first Done-tab visit
  useEffect(() => {
    if (activeTab !== 'done' || doneFetched || doneLoading) return;
    (async () => {
      setDoneLoading(true);
      setDoneError('');
      try {
        const items = await getCompletedTasks(30);
        setDoneTasks(items || []);
        setDoneFetched(true);
        log('TaskHome', `Done tab: ${items?.length ?? 0} completed tasks (30d)`);
      } catch (err: any) {
        logError('TaskHome', err);
        setDoneError(`Could not load completed tasks: ${err.message}`);
      } finally {
        setDoneLoading(false);
      }
    })();
  }, [activeTab, doneFetched, doneLoading]);

  const handleReopen = async (taskId: string) => {
    log('TaskHome', `REOPEN pressed taskId=${taskId}`);
    try {
      await reopenTask(taskId);
      log('TaskHome', `REOPEN success taskId=${taskId}`);
      setDoneTasks(prev => prev.filter(t => t.id !== taskId));
      invalidateCache();
      fetchData(true); // pull the reopened task back into the active lists
    } catch (err: any) {
      logError('TaskHome', err);
      setDoneError(`Reopen failed: ${err.message}`);
    }
  };

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

  // Jump straight into a note at a task's page. Registry pages are 0-based,
  // the intent is 1-based; openNote() closes the plugin view itself.
  const handleOpenNote = (path: string, pageNum0?: number) => {
    const intentPage = (pageNum0 ?? -1) + 1; // unknown page -> 0 = last-used
    log('TaskHome', `OPEN NOTE: ${path} p.${intentPage}`);
    openNote(path, intentPage).then(result => {
      if (!result.success) log('TaskHome', `openNote failed: ${result.error}`);
    });
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

  // Tasks linked to the current NOTE (any page), each with the page it lives
  // on so the band tells you where you'd jump in a long note (design-home-v2).
  // Sources: supertask:// links scanned on the current page, description
  // back-references (page parsed from "<fileName> p.N"), then registry
  // entries (which carry pageNum and cover not-yet-synced tasks).
  const noteTasks = (() => {
    const seen = new Set<string>();
    const result: Array<{task: any; pageNum?: number}> = [];

    // 1. Tasks whose IDs were found as supertask:// links on the current page
    for (const id of pageTaskIds) {
      const match = tasks.find(t => t.id === id);
      if (match && !seen.has(match.id)) {
        seen.add(match.id);
        result.push({task: match, pageNum: noteCtx?.pageNum});
      }
    }

    // 2. Tasks matched by description back-reference anywhere in this note
    if (noteCtx?.fileName) {
      const escaped = noteCtx.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const refRe = new RegExp(`${escaped}(?:\\.note)? p\\.(\\d+)`);
      for (const t of tasks) {
        if (seen.has(t.id) || !t.description) continue;
        const m = t.description.match(refRe);
        if (m) {
          seen.add(t.id);
          result.push({task: t, pageNum: parseInt(m[1], 10)});
        }
      }
    }

    // 3. Registry entries for this note (carry pageNum; cover pending-sync tasks)
    for (const rt of registryNoteTasks) {
      if (!seen.has(rt.id)) {
        seen.add(rt.id);
        const full = tasks.find(t => t.id === rt.id);
        result.push({
          task: full || {id: rt.id, content: rt.content, _registryOnly: true},
          pageNum: rt.pageNum,
        });
      }
    }

    return result.sort((a, b) => (a.pageNum ?? 0) - (b.pageNum ?? 0));
  })();

  const renderThisNote = () => {
    if (noteTasks.length === 0 || loading) return null;

    return (
      <View style={styles.thisPage}>
        <View style={styles.thisPageHeader}>
          <Text style={styles.thisPageTitle}>This Note</Text>
          <Chip label={String(noteTasks.length)} />
          {noteCtx ? <Text style={styles.thisPageNote}>{noteCtx.fileName}</Text> : null}
        </View>
        {noteTasks.map(({task, pageNum}, i) => (
          <View key={task.id}>
            {i > 0 && <View style={styles.thisPageSeparator} />}
            <TaskRow
              task={task}
              onComplete={handleComplete}
              onPress={handleTaskPress}
              showProject={projectMap[task.project_id]}
              pageNum={pageNum}
              // Jump button only for tasks on a DIFFERENT page -- you're
              // already looking at the current one
              onOpenNote={
                noteCtx && pageNum !== undefined && pageNum !== noteCtx.pageNum
                  ? () => handleOpenNote(noteCtx.filePath, pageNum)
                  : undefined
              }
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
    if (activeTab === 'done') return renderDoneTab();
    return renderProjectsTab();
  };

  const renderDoneTab = () => {
    if (doneLoading) {
      return (
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading completed tasks...</Text>
        </View>
      );
    }
    if (doneError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{doneError}</Text>
        </View>
      );
    }
    const visibleDone = projectFiltered(doneTasks);
    if (visibleDone.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Nothing completed in the last 30 days</Text>
        </View>
      );
    }

    const items = groupDoneByBucket(visibleDone, today);

    return (
      <FlatList
        data={items}
        keyExtractor={item => item.key}
        renderItem={({item}) => {
          if (item.type === 'header') {
            return <SectionHeader title={item.title} count={item.count} />;
          }
          // Tap on the filled box reopens -- completion is fully recoverable
          return (
            <TaskRow
              task={item.task}
              checked
              completedAt={item.task.completed_at}
              onComplete={handleReopen}
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

  const renderTodayTab = () => {
    // Tasks due today or overdue, grouped by project
    const todayTasks = projectFiltered(tasks).filter(t => {
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
    const visible = projectFiltered(tasks);
    const upcoming = visible
      .filter(t => {
        const due = t.due?.date;
        return due && due > today;
      })
      .sort((a, b) => (a.due?.date || '').localeCompare(b.due?.date || ''));

    const noDue = visible.filter(t => !t.due?.date);

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

    // Group by full path when known (falls back to bare filename for older
    // registry entries), labeled filesystem-style: "Connor / 1x1" tells you
    // WHERE the note lives, not just its name.
    const byNote: Record<string, {label: string; entries: any[]}> = {};
    for (const dt of deviceTasks) {
      const key = dt.notePath || dt.noteFile || 'Unknown';
      if (!byNote[key]) {
        byNote[key] = {label: noteLabel(dt.notePath, dt.noteFile), entries: []};
      }
      byNote[key].entries.push(dt);
    }

    // Build flat list with headers
    const items: any[] = [];
    for (const [key, group] of Object.entries(byNote)) {
      items.push({type: 'header', key: `h-${key}`, title: group.label, count: group.entries.length});
      for (const dt of group.entries) {
        // Try to find the full Todoist task for richer display
        const fullTask = tasks.find(t => t.id === dt.id);
        // Jump target: stored full path, or same-directory guess for legacy
        // entries (mirrors TaskDetail's View Note fallback)
        let openPath: string | undefined = dt.notePath;
        if (!openPath && dt.noteFile && noteCtx?.filePath) {
          openPath = noteCtx.filePath.substring(0, noteCtx.filePath.lastIndexOf('/') + 1) + dt.noteFile;
        }
        items.push({
          type: 'task',
          key: dt.id,
          task: fullTask || {id: dt.id, content: dt.content, _registryOnly: true},
          pageNum: dt.pageNum,
          openPath,
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
          // Page number rides in the row's chip line -- the old outboard
          // p.N column misaligned Device rows against every other tab.
          return (
            <TaskRow
              task={item.task}
              onComplete={handleComplete}
              onPress={handleTaskPress}
              showProject={projectMap[item.task.project_id]}
              pageNum={item.pageNum}
              onOpenNote={
                item.openPath
                  ? () => handleOpenNote(item.openPath, item.pageNum)
                  : undefined
              }
            />
          );
        }}
        ItemSeparatorComponent={({leadingItem}) =>
          leadingItem?.type !== 'header' ? <View style={styles.separator} /> : null
        }
      />
    );
  };

  const taskCount = tasks.length;

  // B-004: honor the Settings project filter in the time-based views too
  // (Projects tab already did). Device/This Note stay unfiltered -- they
  // reflect physical captures, not project preference.
  const projectFiltered = (list: any[]) =>
    enabledProjectIds.length > 0
      ? list.filter(t => !t.project_id || enabledProjectIds.includes(t.project_id))
      : list;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SuperTask</Text>
        <View style={styles.headerButtons}>
          {/* Primary action is the only inverted button. Log/Diag moved to
              Settings > Debugging -- five identical header buttons had no
              hierarchy (design-home-v2.md). */}
          <Pressable style={[styles.headerButton, styles.headerButtonPrimary]} onPress={handleAddTask}>
            <Text style={[styles.headerButtonText, styles.headerButtonPrimaryText]}>+ New</Text>
          </Pressable>
          <Pressable style={styles.headerButton} onPress={() => { log('TaskHome', 'SETTINGS pressed'); nav.push('config'); }}>
            <Text style={styles.headerButtonText}>Settings</Text>
          </Pressable>
          <Pressable style={styles.headerButton} onPress={() => { log('TaskHome', 'CLOSE pressed'); closePlugin(); }}>
            <Text style={styles.headerButtonText}>Close</Text>
          </Pressable>
        </View>
      </View>

      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={(tab) => { log('TaskHome', `TAB changed: ${tab}`); setActiveTab(tab); }} />

      {renderThisNote()}

      <View style={styles.body}>
        {renderContent()}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </Text>
        <Pressable onPress={() => {
          fetchData(true);
          if (activeTab === 'done') setDoneFetched(false); // refetch completed list too
        }}>
          <Text style={styles.footerRefresh}>Refresh</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Group completed tasks into recency buckets (newest first)
function groupDoneByBucket(doneTasks: any[], today: string): any[] {
  const yesterday = new Date(new Date(today + 'T00:00:00').getTime() - 86400000)
    .toISOString().slice(0, 10);
  const weekAgo = new Date(new Date(today + 'T00:00:00').getTime() - 7 * 86400000)
    .toISOString().slice(0, 10);

  const sorted = [...doneTasks].sort((a, b) =>
    (b.completed_at || '').localeCompare(a.completed_at || ''));

  const buckets: {today: any[]; yesterday: any[]; week: any[]; earlier: any[]} = {
    today: [], yesterday: [], week: [], earlier: [],
  };
  for (const t of sorted) {
    const d = (t.completed_at || '').slice(0, 10);
    if (d === today) buckets.today.push(t);
    else if (d === yesterday) buckets.yesterday.push(t);
    else if (d >= weekAgo) buckets.week.push(t);
    else buckets.earlier.push(t);
  }

  const items: any[] = [];
  const pushBucket = (key: string, title: string, arr: any[]) => {
    if (!arr.length) return;
    items.push({key: `header-${key}`, type: 'header', title, count: arr.length});
    arr.forEach(t => items.push({key: `done-${t.id}`, type: 'task', task: t}));
  };
  pushBucket('dtoday', 'Today', buckets.today);
  pushBucket('dyesterday', 'Yesterday', buckets.yesterday);
  pushBucket('dweek', 'This Week', buckets.week);
  pushBucket('dearlier', 'Earlier', buckets.earlier);
  return items;
}

// Filesystem-style note label: "/storage/emulated/0/Note/Connor/1x1.note"
// -> "Connor / 1x1". Falls back to the bare filename for registry entries
// that predate notePath storage.
function noteLabel(notePath?: string, noteFile?: string): string {
  if (notePath) {
    const rel = notePath
      .replace(/^\/storage\/emulated\/0\//, '')
      .replace(/^(Note|Document)\//, '')
      .replace(/\.note$/, '');
    return rel.split('/').filter(Boolean).join(' / ');
  }
  return (noteFile || 'Unknown').replace('.note', '');
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
    borderBottomWidth: 2,
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
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    backgroundColor: '#ffffff',
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  headerButtonPrimary: {
    backgroundColor: '#000000',
  },
  headerButtonPrimaryText: {
    color: '#ffffff',
  },
  thisPage: {
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    backgroundColor: '#ffffff',
  },
  thisPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  thisPageNote: {
    fontSize: 13,
    color: '#555555',
    flexShrink: 1,
  },
  thisPageSeparator: {
    height: 1,
    backgroundColor: '#000000',
    marginLeft: 66,
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
    backgroundColor: '#000000',
    marginLeft: 66,
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
