import { useState, useCallback, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import {
  FileCode2, FileCode, FileType, FileJson, FileText,
  Folder, FolderOpen, File, ChevronDown, ChevronRight,
  X, FilePlus, FolderPlus,
  ArrowLeft as PreviewBack, ArrowRight as PreviewForward,
  RotateCw, ExternalLink,
} from 'lucide-react';
import { api } from '../api/client';
import { IconButton } from './ui/IconButton';
import { ActivityPanel } from './ActivityPanel';
import type { FileNode } from '../types/api';
import type { SessionDetail } from '../api/client';

interface ProjectWorkspaceProps {
  session: SessionDetail;
  onClose: () => void;
}

function getFileIcon(name: string, type: string, isOpen?: boolean): React.ReactNode {
  if (type === 'directory') return isOpen ? <FolderOpen size={14} /> : <Folder size={14} />;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, React.ReactNode> = {
    js: <FileCode2 size={14} className="text-yellow-600" />,
    ts: <FileCode2 size={14} className="text-blue-500" />,
    tsx: <FileCode2 size={14} className="text-blue-400" />,
    jsx: <FileCode2 size={14} className="text-yellow-500" />,
    py: <FileCode2 size={14} className="text-green-600" />,
    html: <FileCode size={14} className="text-orange-500" />,
    css: <FileType size={14} className="text-purple-500" />,
    json: <FileJson size={14} className="text-green-500" />,
    md: <FileText size={14} className="text-muted" />,
    go: <FileCode2 size={14} className="text-cyan-600" />,
    rs: <FileCode2 size={14} className="text-orange-600" />,
    rb: <FileCode2 size={14} className="text-red-500" />,
    sh: <FileCode2 size={14} className="text-green-600" />,
  };
  return icons[ext] || <File size={14} />;
}

function getMonacoLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', less: 'less',
    json: 'json',
    md: 'markdown',
    go: 'go',
    rs: 'rust',
    sh: 'shell', bash: 'shell',
    yml: 'yaml', yaml: 'yaml',
    xml: 'xml', svg: 'xml',
    sql: 'sql',
    java: 'java',
    kt: 'kotlin',
    rb: 'ruby',
    dockerfile: 'dockerfile',
  };
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile') return 'makefile';
  return map[ext] || 'plaintext';
}

function hasHtmlFile(files: FileNode[]): boolean {
  for (const f of files) {
    if (f.type === 'file' && f.name.endsWith('.html')) return true;
    if (f.children && hasHtmlFile(f.children)) return true;
  }
  return false;
}

function findFileSize(files: FileNode[], path: string): number | undefined {
  for (const f of files) {
    if (f.path === path) return f.size;
    if (f.children) {
      const found = findFileSize(f.children, path);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTree({
  nodes, selectedPath, onSelect, onDelete, depth = 0,
}: {
  nodes: FileNode[]; selectedPath: string | null;
  onSelect: (path: string, name: string) => void;
  onDelete?: (path: string, name: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (depth < 2) nodes.filter(n => n.type === 'directory').forEach(n => set.add(n.path));
    return set;
  });

  return (
    <div role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map((node) => {
        const isDir = node.type === 'directory';
        const isOpen = expanded.has(node.path);
        const isSelected = node.path === selectedPath;
        return (
          <div key={node.path} className="group/file">
            <button
              role="treeitem"
              aria-label={node.name}
              aria-selected={isSelected}
              {...(isDir ? { 'aria-expanded': isOpen } : {})}
              onClick={() => {
                if (isDir) {
                  setExpanded(prev => {
                    const next = new Set(prev);
                    next.has(node.path) ? next.delete(node.path) : next.add(node.path);
                    return next;
                  });
                } else {
                  onSelect(node.path, node.name);
                }
              }}
              className={`w-full text-left flex items-center gap-1.5 px-2 py-1 text-xs font-mono rounded transition-colors ${
                isSelected ? 'bg-primary/10 text-primary' : 'text-ink/70 hover:bg-hover'
              }`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              {isDir ? (
                <span className="w-3 flex items-center justify-center flex-shrink-0 text-muted">
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              ) : (
                <span className="w-3 flex-shrink-0" />
              )}
              <span className={`w-5 flex items-center justify-center flex-shrink-0 ${isDir ? 'text-primary' : ''}`}>
                {getFileIcon(node.name, node.type, isOpen)}
              </span>
              <span className="truncate">{node.name}{isDir ? '/' : ''}</span>
              {!isDir && node.size != null && node.size > 0 && (
                <span className="text-[10px] text-muted/40 ml-auto flex-shrink-0">{formatSize(node.size)}</span>
              )}
              {!isDir && onDelete && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node.path, node.name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.stopPropagation(); onDelete(node.path, node.name); }
                  }}
                  className="text-muted/30 hover:text-danger ml-1 flex-shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity cursor-pointer"
                  title="Delete file"
                >
                  <X size={12} />
                </span>
              )}
            </button>
            {isDir && isOpen && node.children && (
              <FileTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} onDelete={onDelete} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  modified: boolean;
}

function flattenFiles(nodes: FileNode[], prefix = ''): { path: string; name: string }[] {
  const result: { path: string; name: string }[] = [];
  for (const n of nodes) {
    if (n.type === 'file') result.push({ path: n.path, name: n.name });
    if (n.children) result.push(...flattenFiles(n.children, n.path + '/'));
  }
  return result;
}

export function ProjectWorkspace({ session, onClose }: ProjectWorkspaceProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sessionData, setSessionData] = useState<SessionDetail>(session);
  const editorRef = useRef<unknown>(null);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const quickOpenRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const canPreview = hasHtmlFile(sessionData.files);
  const previewUrl = `/api/sessions/${encodeURIComponent(sessionData.id)}/preview/index.html`;

  const refreshSession = useCallback(async () => {
    try {
      const updated = await api.getSessionDetail(sessionData.id);
      setSessionData(updated);
    } catch {
      // ignore refresh errors
    }
  }, [sessionData.id]);

  const handleFileSelect = useCallback(async (path: string, name: string) => {
    // Save current tab state before switching
    if (isModified && selectedFile && editorContent !== null) {
      setOpenTabs(prev => prev.map(t =>
        t.path === selectedFile ? { ...t, content: editorContent, modified: true } : t
      ));
    }

    // Check if already open in a tab
    const existingTab = openTabs.find(t => t.path === path);
    if (existingTab) {
      setSelectedFile(path);
      setSelectedFileName(name);
      setFileContent(existingTab.content);
      setEditorContent(existingTab.content);
      setIsModified(existingTab.modified);
      return;
    }

    setSelectedFile(path);
    setSelectedFileName(name);
    setFileLoading(true);
    setIsModified(false);
    try {
      const result = sessionData.id
        ? await api.getSessionFileContent(sessionData.id, path)
        : await api.getFileContent(path);
      setFileContent(result.content);
      setEditorContent(result.content);
      // Add to open tabs
      setOpenTabs(prev => [...prev, { path, name, content: result.content, modified: false }]);
    } catch {
      setFileContent('[Error loading file]');
      setEditorContent('[Error loading file]');
    } finally {
      setFileLoading(false);
    }
  }, [sessionData.id, isModified, selectedFile, editorContent, openTabs]);

  const handleSave = useCallback(async () => {
    if (!selectedFile || editorContent === null || !sessionData.id) return;
    setIsSaving(true);
    try {
      await api.saveSessionFile(sessionData.id, selectedFile, editorContent);
      setFileContent(editorContent);
      setIsModified(false);
      // Update tab state
      setOpenTabs(prev => prev.map(t =>
        t.path === selectedFile ? { ...t, content: editorContent, modified: false } : t
      ));
      // Refresh preview if an HTML/CSS/JS file was saved
      const ext = selectedFile.split('.').pop()?.toLowerCase() || '';
      if (['html', 'css', 'js', 'jsx', 'ts', 'tsx'].includes(ext)) {
        setPreviewKey(k => k + 1);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      window.alert(`Save failed: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  }, [selectedFile, editorContent, sessionData.id]);

  const handleCloseTab = useCallback((path: string) => {
    const tab = openTabs.find(t => t.path === path);
    if (tab?.modified) {
      if (!window.confirm('Unsaved changes. Close anyway?')) return;
    }
    setOpenTabs(prev => prev.filter(t => t.path !== path));
    if (selectedFile === path) {
      const remaining = openTabs.filter(t => t.path !== path);
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1];
        setSelectedFile(next.path);
        setSelectedFileName(next.name);
        setFileContent(next.content);
        setEditorContent(next.content);
        setIsModified(next.modified);
      } else {
        setSelectedFile(null);
        setSelectedFileName('');
        setFileContent(null);
        setEditorContent(null);
        setIsModified(false);
      }
    }
  }, [openTabs, selectedFile]);

  // Cmd/Ctrl+S to save, Cmd/Ctrl+P to quick open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isModified && selectedFile) handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setShowQuickOpen(prev => !prev);
        setQuickOpenQuery('');
      }
      if (e.key === 'Escape' && showQuickOpen) {
        setShowQuickOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isModified, selectedFile, handleSave, showQuickOpen]);

  // Focus quick open input when shown
  useEffect(() => {
    if (showQuickOpen && quickOpenRef.current) quickOpenRef.current.focus();
  }, [showQuickOpen]);

  const allFiles = flattenFiles(sessionData.files);
  const filteredFiles = quickOpenQuery
    ? allFiles.filter(f => f.path.toLowerCase().includes(quickOpenQuery.toLowerCase()))
    : allFiles;

  // Auto-select index.html on mount
  useEffect(() => {
    const indexFile = sessionData.files.find(f => f.name === 'index.html' && f.type === 'file');
    if (indexFile) {
      handleFileSelect(indexFile.path, indexFile.name);
      setShowPreview(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditorContent(value);
      setIsModified(value !== fileContent);
    }
  }, [fileContent]);

  const handleEditorMount = useCallback((editor: unknown) => {
    editorRef.current = editor;
  }, []);

  const handleCreateFile = useCallback(async () => {
    const name = window.prompt('New file name (e.g. src/utils.ts):');
    if (!name || !name.trim()) return;
    try {
      await api.createSessionFile(sessionData.id, name.trim());
      await refreshSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      window.alert(`Create file failed: ${msg}`);
    }
  }, [sessionData.id, refreshSession]);

  const handleCreateFolder = useCallback(async () => {
    const name = window.prompt('New folder name (e.g. src/components):');
    if (!name || !name.trim()) return;
    try {
      await api.createSessionDirectory(sessionData.id, name.trim());
      await refreshSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      window.alert(`Create folder failed: ${msg}`);
    }
  }, [sessionData.id, refreshSession]);

  const handleDeleteFile = useCallback(async (path: string, name: string) => {
    const confirmed = window.confirm(`Delete "${name}"?`);
    if (!confirmed) return;
    try {
      await api.deleteSessionFile(sessionData.id, path);
      // If the deleted file was selected, clear the editor
      if (selectedFile === path) {
        setSelectedFile(null);
        setSelectedFileName('');
        setFileContent(null);
        setEditorContent(null);
        setIsModified(false);
      }
      await refreshSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      window.alert(`Delete failed: ${msg}`);
    }
  }, [sessionData.id, selectedFile, refreshSession]);

  const fileSize = selectedFile ? findFileSize(sessionData.files, selectedFile) : undefined;
  const fileExt = selectedFileName.split('.').pop()?.toUpperCase() || '';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-card px-3 py-2 flex items-center gap-3 flex-shrink-0 border-b border-border">
        <button onClick={() => {
          if (isModified) {
            const discard = window.confirm('Unsaved changes. Discard?');
            if (!discard) return;
          }
          onClose();
        }}
          className="text-xs font-medium px-3 py-1.5 rounded-btn border border-border text-muted hover:text-ink hover:bg-hover transition-colors">
          Back
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-ink truncate">{sessionData.id}</h2>
          <p className="text-[10px] font-mono text-muted-accessible truncate">{sessionData.path}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          sessionData.status === 'completed' || sessionData.status === 'completion_promise_fulfilled'
            ? 'bg-success/10 text-success' : 'bg-muted/10 text-muted'
        }`}>{sessionData.status}</span>
        {canPreview && (
          <button onClick={() => setShowPreview(!showPreview)}
            className={`text-xs font-medium px-3 py-1.5 rounded-btn border transition-colors ${
              showPreview ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-muted hover:text-ink hover:bg-hover'
            }`}>
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
        )}
      </div>

      {/* Workspace: vertical split - top: editor, bottom: activity panel */}
      <div className="flex-1 min-h-0">
        <PanelGroup orientation="vertical">
          <Panel defaultSize={70} minSize={40}>
            {/* Horizontal split: file tree | editor | preview */}
            <PanelGroup orientation="horizontal" className="h-full">
              {/* Sidebar: file tree */}
              <Panel defaultSize={20} minSize={15}>
                <div className="h-full flex flex-col border-r border-border bg-card">
                  <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                    <span className="text-[10px] text-muted-accessible uppercase tracking-wider font-semibold flex-1">Files</span>
                    <button
                      onClick={handleCreateFile}
                      title="New File"
                      className="flex items-center gap-1 text-[10px] text-muted-accessible hover:text-primary px-1.5 py-0.5 rounded border border-border hover:border-primary/30 transition-colors"
                    >
                      <FilePlus size={12} /> New
                    </button>
                    <button
                      onClick={handleCreateFolder}
                      title="New Folder"
                      className="flex items-center gap-1 text-[10px] text-muted-accessible hover:text-primary px-1.5 py-0.5 rounded border border-border hover:border-primary/30 transition-colors"
                    >
                      <FolderPlus size={12} /> New
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto terminal-scroll">
                    {sessionData.files.length > 0 ? (
                      <FileTree
                        nodes={sessionData.files}
                        selectedPath={selectedFile}
                        onSelect={handleFileSelect}
                        onDelete={handleDeleteFile}
                      />
                    ) : (
                      <div className="p-4 text-xs text-muted">No files</div>
                    )}
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors cursor-col-resize" />

              {/* Editor */}
              <Panel defaultSize={showPreview ? 50 : 80} minSize={25}>
                <div className="h-full flex flex-col min-w-0">
                  {/* Tab bar */}
                  {openTabs.length > 0 && (
                    <div className="flex items-center border-b border-border bg-hover overflow-x-auto flex-shrink-0">
                      {openTabs.map(tab => (
                        <button
                          key={tab.path}
                          onClick={() => handleFileSelect(tab.path, tab.name)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border-r border-border whitespace-nowrap transition-colors ${
                            tab.path === selectedFile
                              ? 'bg-card text-ink'
                              : 'text-muted hover:text-ink hover:bg-card'
                          }`}
                        >
                          <span className="w-4 flex items-center justify-center">
                            {getFileIcon(tab.name, 'file')}
                          </span>
                          {tab.name}
                          {tab.modified && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.path); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleCloseTab(tab.path); } }}
                            className="text-muted/30 hover:text-danger ml-1 cursor-pointer"
                          >
                            <X size={12} />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedFile ? (
                    <>
                      <div className="px-4 py-1.5 border-b border-border flex items-center gap-2 flex-shrink-0 bg-hover">
                        <span className="text-xs font-mono text-ink/60 truncate">{selectedFile}</span>
                        {isSaving && (
                          <span className="text-[10px] text-primary animate-pulse flex-shrink-0">Saving...</span>
                        )}
                        <span className="ml-auto text-[10px] text-muted/50 font-mono">
                          {fileSize != null ? formatSize(fileSize) : ''}
                        </span>
                        <span className="text-[10px] text-muted/40 font-mono uppercase">{fileExt}</span>
                        {isModified && (
                          <button
                            onClick={handleSave}
                            className="text-[10px] font-medium px-2 py-0.5 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            Save
                          </button>
                        )}
                      </div>
                      <div className="flex-1 min-h-0">
                        {fileLoading ? (
                          <div className="text-muted text-xs animate-pulse p-4">Loading...</div>
                        ) : (
                          <Editor
                            value={editorContent ?? ''}
                            language={getMonacoLanguage(selectedFileName)}
                            theme="vs"
                            onChange={handleEditorChange}
                            onMount={handleEditorMount}
                            options={{
                              minimap: { enabled: false },
                              fontSize: 13,
                              lineNumbers: 'on',
                              wordWrap: 'on',
                              scrollBeyondLastLine: false,
                              automaticLayout: true,
                              padding: { top: 8 },
                              renderLineHighlight: 'line',
                              smoothScrolling: true,
                              cursorBlinking: 'smooth',
                              folding: true,
                              bracketPairColorization: { enabled: true },
                            }}
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted text-sm">
                      Select a file to view its contents
                    </div>
                  )}
                </div>
              </Panel>

              {/* Live preview (collapsible) */}
              {showPreview && (
                <>
                  <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors cursor-col-resize" />
                  <Panel defaultSize={30} minSize={20} collapsible>
                    <div className="h-full flex flex-col border-l border-border">
                      {/* Preview toolbar */}
                      <div className="px-3 py-1.5 border-b border-border flex items-center gap-2 bg-hover">
                        <IconButton icon={PreviewBack} label="Back" size="sm" onClick={() => {}} />
                        <IconButton icon={PreviewForward} label="Forward" size="sm" onClick={() => {}} />
                        <IconButton icon={RotateCw} label="Refresh" size="sm" onClick={() => setPreviewKey(k => k + 1)} />
                        <input
                          value={previewUrl}
                          readOnly
                          className="flex-1 px-3 py-1 text-xs font-mono bg-card border border-border rounded-btn"
                        />
                        <IconButton icon={ExternalLink} label="Open in new tab" size="sm" onClick={() => window.open(previewUrl, '_blank')} />
                      </div>
                      <div className="flex-1 bg-white">
                        <iframe
                          key={previewKey}
                          ref={previewRef}
                          src={previewUrl}
                          title="Project Preview"
                          className="w-full h-full border-0"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        />
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="h-1 bg-border hover:bg-primary/30 cursor-row-resize" />

          <Panel defaultSize={30} minSize={15} collapsible>
            <ActivityPanel
              logs={null}
              logsLoading={false}
              agents={null}
              checklist={null}
              sessionId={session.id}
            />
          </Panel>
        </PanelGroup>
      </div>

      {/* Quick Open modal (Cmd+P) */}
      {showQuickOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" role="dialog" aria-modal="true" aria-label="Quick open file search" onClick={() => setShowQuickOpen(false)}>
          <div className="bg-card rounded-card shadow-2xl border border-border w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <input
              ref={quickOpenRef}
              type="text"
              value={quickOpenQuery}
              onChange={e => setQuickOpenQuery(e.target.value)}
              placeholder="Search files by name..."
              className="w-full px-4 py-3 text-sm font-mono border-b border-border outline-none rounded-t-card bg-transparent"
              onKeyDown={e => {
                if (e.key === 'Enter' && filteredFiles.length > 0) {
                  handleFileSelect(filteredFiles[0].path, filteredFiles[0].name);
                  setShowQuickOpen(false);
                }
                if (e.key === 'Escape') setShowQuickOpen(false);
              }}
            />
            <div className="max-h-64 overflow-y-auto">
              {filteredFiles.slice(0, 20).map(f => (
                <button
                  key={f.path}
                  onClick={() => {
                    handleFileSelect(f.path, f.name);
                    setShowQuickOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-mono hover:bg-primary/5 flex items-center gap-2"
                >
                  <span className="w-5 flex items-center justify-center">
                    {getFileIcon(f.name, 'file')}
                  </span>
                  <span className="text-ink">{f.name}</span>
                  <span className="text-muted/40 ml-auto truncate text-[10px]">{f.path}</span>
                </button>
              ))}
              {filteredFiles.length === 0 && (
                <div className="px-4 py-3 text-xs text-muted">No matching files</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
