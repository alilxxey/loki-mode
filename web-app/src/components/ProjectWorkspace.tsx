import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type { FileNode } from '../types/api';
import type { SessionDetail } from '../api/client';

interface ProjectWorkspaceProps {
  session: SessionDetail;
  onClose: () => void;
}

function getLanguageClass(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'text-yellow-600', ts: 'text-blue-500', tsx: 'text-blue-400', jsx: 'text-yellow-500',
    py: 'text-green-600', rb: 'text-red-500', go: 'text-cyan-600',
    html: 'text-orange-500', css: 'text-purple-500', json: 'text-green-500',
    md: 'text-slate', yaml: 'text-green-400', yml: 'text-green-400',
    sh: 'text-green-600', bash: 'text-green-600',
    rs: 'text-orange-600', java: 'text-red-600', kt: 'text-purple-600',
    sql: 'text-blue-600', svg: 'text-orange-400',
  };
  return map[ext] || 'text-charcoal/80';
}

function getFileIcon(name: string, type: string): string {
  if (type === 'directory') return '[ ]';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    js: 'JS', ts: 'TS', tsx: 'TX', jsx: 'JX', py: 'PY', html: '<>', css: '##',
    json: '{}', md: 'MD', yml: 'YL', yaml: 'YL', sh: 'SH', go: 'GO',
    rs: 'RS', rb: 'RB', java: 'JV', kt: 'KT', sql: 'SQ', svg: 'SV',
    png: 'IM', jpg: 'IM', gif: 'IM', ico: 'IC',
  };
  return icons[ext] || '..';
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
  nodes, selectedPath, onSelect, depth = 0,
}: {
  nodes: FileNode[]; selectedPath: string | null;
  onSelect: (path: string, name: string) => void; depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (depth < 2) nodes.filter(n => n.type === 'directory').forEach(n => set.add(n.path));
    return set;
  });

  return (
    <div>
      {nodes.map((node) => {
        const isDir = node.type === 'directory';
        const isOpen = expanded.has(node.path);
        const isSelected = node.path === selectedPath;
        return (
          <div key={node.path}>
            <button
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
                isSelected ? 'bg-accent-product/10 text-accent-product' : 'text-charcoal/70 hover:bg-white/40'
              }`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              {isDir ? (
                <span className="text-[10px] text-slate w-3 text-center flex-shrink-0">{isOpen ? 'v' : '>'}</span>
              ) : (
                <span className="w-3 flex-shrink-0" />
              )}
              <span className={`text-[10px] font-bold w-5 text-center flex-shrink-0 ${isDir ? 'text-accent-product' : getLanguageClass(node.name)}`}>
                {getFileIcon(node.name, node.type)}
              </span>
              <span className="truncate">{node.name}{isDir ? '/' : ''}</span>
              {!isDir && node.size != null && node.size > 0 && (
                <span className="text-[10px] text-slate/40 ml-auto flex-shrink-0">{formatSize(node.size)}</span>
              )}
            </button>
            {isDir && isOpen && node.children && (
              <FileTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProjectWorkspace({ session, onClose }: ProjectWorkspaceProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canPreview = hasHtmlFile(session.files);
  const previewUrl = `/api/sessions/${encodeURIComponent(session.id)}/preview/index.html`;

  const handleFileSelect = useCallback(async (path: string, name: string) => {
    setSelectedFile(path);
    setSelectedFileName(name);
    setFileLoading(true);
    try {
      const result = session.id
        ? await api.getSessionFileContent(session.id, path)
        : await api.getFileContent(path);
      setFileContent(result.content);
    } catch {
      setFileContent('[Error loading file]');
    } finally {
      setFileLoading(false);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [session.id]);

  // Auto-select index.html on mount
  useEffect(() => {
    const indexFile = session.files.find(f => f.name === 'index.html' && f.type === 'file');
    if (indexFile) {
      handleFileSelect(indexFile.path, indexFile.name);
      setShowPreview(true);
    }
  }, [session.files, handleFileSelect]);

  const fileSize = selectedFile ? findFileSize(session.files, selectedFile) : undefined;
  const fileExt = selectedFileName.split('.').pop()?.toUpperCase() || '';
  const lines = fileContent?.split('\n') || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass px-5 py-3 flex items-center gap-4 flex-shrink-0 border-b border-white/10">
        <button onClick={onClose}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/20 text-slate hover:text-charcoal hover:bg-white/30 transition-colors">
          Back
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-charcoal truncate">{session.id}</h2>
          <p className="text-[10px] font-mono text-slate truncate">{session.path}</p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          session.status === 'completed' || session.status === 'completion_promise_fulfilled'
            ? 'bg-success/10 text-success' : 'bg-slate/10 text-slate'
        }`}>{session.status}</span>
        {canPreview && (
          <button onClick={() => setShowPreview(!showPreview)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              showPreview ? 'border-accent-product/40 bg-accent-product/10 text-accent-product'
                : 'border-white/20 text-slate hover:text-charcoal hover:bg-white/30'
            }`}>
            {showPreview ? 'Hide Preview' : 'Preview'}
          </button>
        )}
      </div>

      {/* Workspace: file tree | code viewer | preview */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar: file tree */}
        <div className="w-56 flex-shrink-0 border-r border-white/10 overflow-y-auto terminal-scroll bg-white/30">
          <div className="px-3 py-2 border-b border-white/10">
            <span className="text-[10px] text-slate uppercase tracking-wider font-semibold">Files</span>
          </div>
          {session.files.length > 0 ? (
            <FileTree nodes={session.files} selectedPath={selectedFile} onSelect={handleFileSelect} />
          ) : (
            <div className="p-4 text-xs text-slate">No files</div>
          )}
        </div>

        {/* Code viewer */}
        <div className={`flex-1 flex flex-col min-w-0 ${showPreview ? 'max-w-[50%]' : ''}`}>
          {selectedFile ? (
            <>
              <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 flex-shrink-0 bg-white/20">
                <span className={`text-[10px] font-bold ${getLanguageClass(selectedFileName)}`}>
                  {getFileIcon(selectedFileName, 'file')}
                </span>
                <span className="text-xs font-mono text-charcoal truncate">{selectedFile}</span>
                <span className="ml-auto text-[10px] text-slate/50 font-mono">
                  {fileSize != null ? formatSize(fileSize) : ''}
                </span>
                <span className="text-[10px] text-slate/40 font-mono uppercase">{fileExt}</span>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-auto terminal-scroll bg-charcoal/[0.03]">
                {fileLoading ? (
                  <div className="text-slate text-xs animate-pulse p-4">Loading...</div>
                ) : (
                  <table className="font-mono text-xs leading-relaxed w-full border-collapse">
                    <tbody>
                      {lines.map((line, i) => (
                        <tr key={i} className="hover:bg-white/30">
                          <td className="text-right pr-4 pl-3 py-0 select-none text-slate/30 w-12 align-top border-r border-white/10 text-[10px]">
                            {i + 1}
                          </td>
                          <td className={`pl-4 pr-3 py-0 whitespace-pre-wrap break-all ${getLanguageClass(selectedFileName)}`}>
                            {line || '\u00A0'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate text-sm">
              Select a file to view its contents
            </div>
          )}
        </div>

        {/* Live preview */}
        {showPreview && (
          <div className="w-[50%] flex-shrink-0 border-l border-white/10 flex flex-col">
            <div className="px-4 py-2 border-b border-white/10 flex items-center gap-2 flex-shrink-0 bg-white/20">
              <span className="text-xs font-semibold text-charcoal">Live Preview</span>
              <span className="text-[10px] font-mono text-slate/50 truncate ml-auto">{previewUrl}</span>
            </div>
            <div className="flex-1 bg-white">
              <iframe
                src={previewUrl}
                title="Project Preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
