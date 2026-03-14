import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { 
  Terminal, Play, Download, Settings, ChevronLeft, Plus, 
  FileCode2, FilePlus, FolderPlus, Save, LayoutPanelLeft, RefreshCw
} from "lucide-react";

import { 
  useGetProject, 
  useListFiles, 
  useReadFile, 
  useWriteFile,
  useExecutePhp,
  useCreateFolder,
  useDeleteFile,
  useRenameFile,
  useListDatabases,
  useCreateDatabase,
  useDropDatabase,
  useRunQuery,
  useListTables
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FileTree } from "@/components/ide/FileTree";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Utility to guess monaco language
function getLanguageFromPath(path: string) {
  if (path.endsWith('.php')) return 'php';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.sql')) return 'sql';
  if (path.endsWith('.json')) return 'json';
  return 'plaintext';
}

export default function IDEPage() {
  const { projectId } = useParams();
  const id = parseInt(projectId || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Project Info
  const { data: project, isLoading: isProjLoading } = useGetProject(id);
  
  // File System State
  const { data: files } = useListFiles(id);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [unsavedFiles, setUnsavedFiles] = useState<Set<string>>(new Set());
  
  // Load specific file content
  const { data: fileData, isLoading: isFileLoading } = useReadFile(id, { path: selectedFilePath || "" }, {
    query: { enabled: !!selectedFilePath && !fileContents[selectedFilePath] }
  });

  // Editor State
  const writeFileMutation = useWriteFile();
  const executePhpMutation = useExecutePhp();
  const [terminalLog, setTerminalLog] = useState<string>("Cloud PHP Lab Terminal initialized...\n");
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewKey, setPreviewKey] = useState(0);

  // File mutations
  const createFolderMutation = useCreateFolder();
  const renameFileMutation = useRenameFile();
  const deleteFileMutation = useDeleteFile();

  // Populate local content cache when file is fetched
  useEffect(() => {
    if (fileData && selectedFilePath && !fileContents[selectedFilePath]) {
      setFileContents(prev => ({ ...prev, [selectedFilePath]: fileData.content }));
    }
  }, [fileData, selectedFilePath]);

  // Handle Editor Change
  const handleEditorChange = (value: string | undefined) => {
    if (selectedFilePath && value !== undefined) {
      setFileContents(prev => ({ ...prev, [selectedFilePath]: value }));
      setUnsavedFiles(prev => new Set(prev).add(selectedFilePath));
    }
  };

  // Save File
  const handleSave = async () => {
    if (!selectedFilePath) return;
    const content = fileContents[selectedFilePath];
    if (content === undefined) return;

    try {
      await writeFileMutation.mutateAsync({ projectId: id, data: { path: selectedFilePath, content } });
      setUnsavedFiles(prev => {
        const next = new Set(prev);
        next.delete(selectedFilePath);
        return next;
      });
      // Optionally show silent toast
    } catch (e: any) {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    }
  };

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFilePath, fileContents]);

  // Execute PHP
  const handleRun = async () => {
    if (!selectedFilePath || !selectedFilePath.endsWith('.php')) {
      toast({ variant: "destructive", title: "Not a PHP file", description: "Select a PHP file to run." });
      return;
    }
    
    // Save first if unsaved
    if (unsavedFiles.has(selectedFilePath)) {
      await handleSave();
    }

    setTerminalLog(prev => prev + `\n> Executing ${selectedFilePath}...\n`);
    
    try {
      const res = await executePhpMutation.mutateAsync({ projectId: id, data: { filePath: selectedFilePath } });
      setPreviewHtml(res.output);
      setPreviewKey(k => k + 1); // force iframe re-render
      
      if (res.error) {
        setTerminalLog(prev => prev + `[PHP Error] ${res.error}\n`);
      }
      setTerminalLog(prev => prev + `Process exited with code ${res.exitCode}\n`);
    } catch (e: any) {
      setTerminalLog(prev => prev + `[Execution Failed] ${e.message}\n`);
    }
  };

  // File Actions
  const handleFileAction = async (action: 'new-file' | 'new-folder' | 'rename' | 'delete', path: string) => {
    if (action === 'new-file' || action === 'new-folder') {
      const name = prompt(`Enter name for new ${action === 'new-file' ? 'file' : 'folder'}:`);
      if (!name) return;
      const newPath = path ? `${path}/${name}` : name;
      
      try {
        if (action === 'new-file') {
          await writeFileMutation.mutateAsync({ projectId: id, data: { path: newPath, content: '' } });
          setSelectedFilePath(newPath);
          setFileContents(prev => ({ ...prev, [newPath]: '' }));
        } else {
          await createFolderMutation.mutateAsync({ projectId: id, data: { path: newPath } });
        }
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/files`] });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    } else if (action === 'rename') {
      const newName = prompt("Enter new name:", path.split('/').pop());
      if (!newName) return;
      const dir = path.split('/').slice(0, -1).join('/');
      const newPath = dir ? `${dir}/${newName}` : newName;
      
      try {
        await renameFileMutation.mutateAsync({ projectId: id, data: { oldPath: path, newPath } });
        if (selectedFilePath === path) setSelectedFilePath(newPath);
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/files`] });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    } else if (action === 'delete') {
      if (!confirm(`Delete ${path}?`)) return;
      try {
        await deleteFileMutation.mutateAsync({ projectId: id, data: { path } });
        if (selectedFilePath === path) setSelectedFilePath(null);
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/files`] });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    }
  };

  // --- Database Logic ---
  const { data: dbs } = useListDatabases(id);
  const [selectedDb, setSelectedDb] = useState<string>("");
  const { data: tables } = useListTables(id, selectedDb, { query: { enabled: !!selectedDb } });
  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM users;");
  const [queryResult, setQueryResult] = useState<any>(null);
  
  const createDbMutation = useCreateDatabase();
  const runQueryMutation = useRunQuery();

  const handleCreateDb = async () => {
    const name = prompt("Enter database name (e.g. app_db):");
    if (!name) return;
    try {
      await createDbMutation.mutateAsync({ projectId: id, data: { dbName: name } });
      setSelectedDb(name);
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/databases`] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleRunQuery = async () => {
    if (!selectedDb) {
      toast({ variant: "destructive", title: "No Database", description: "Select a database first." });
      return;
    }
    try {
      const res = await runQueryMutation.mutateAsync({ projectId: id, dbName: selectedDb, data: { sql: sqlQuery } });
      setQueryResult(res);
      if (res.error) toast({ variant: "destructive", title: "SQL Error", description: res.error });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${id}/databases/${selectedDb}/tables`] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  if (isProjLoading) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><Spinner size="xl" /></div>;
  }

  if (!project) return <div className="p-8 text-foreground">Project not found</div>;

  return (
    <div className="h-screen w-full flex flex-col bg-background overflow-hidden text-foreground">
      {/* Top Header */}
      <header className="h-12 border-b border-border bg-sidebar flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors flex items-center group">
            <ChevronLeft className="w-5 h-5 mr-1 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Dashboard</span>
          </Link>
          <div className="h-4 w-px bg-border"></div>
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="font-semibold">{project.projectName}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground"
            onClick={handleRun}
            disabled={!selectedFilePath?.endsWith('.php') || executePhpMutation.isPending}
          >
            {executePhpMutation.isPending ? <Spinner size="sm" className="mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            Run PHP
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-muted-foreground hover:text-foreground"
            onClick={() => window.location.href = `/api/projects/${id}/export`}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Zip
          </Button>
        </div>
      </header>

      {/* Main IDE Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - File Explorer */}
        <div className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0">
          <div className="ide-panel-header justify-between">
            <span>Explorer</span>
            <div className="flex items-center space-x-1">
              <button onClick={() => handleFileAction('new-file', '')} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="New File">
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleFileAction('new-folder', '')} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="New Folder">
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {files ? (
              <FileTree 
                nodes={files} 
                onSelect={setSelectedFilePath} 
                selectedPath={selectedFilePath}
                onAction={handleFileAction}
              />
            ) : (
              <div className="flex justify-center p-4"><Spinner size="sm" /></div>
            )}
          </div>
        </div>

        {/* Center - Editor & Terminal */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
          {/* Editor Header (Tabs) */}
          <div className="h-9 bg-sidebar border-b border-border flex items-center overflow-x-auto shrink-0 scrollbar-hide">
            {selectedFilePath ? (
              <div className="flex items-center h-full px-4 border-r border-border bg-[#1e1e1e] text-sm text-foreground space-x-2 border-t-2 border-t-primary">
                <FileCode2 className="w-4 h-4 text-primary" />
                <span>{selectedFilePath.split('/').pop()}</span>
                {unsavedFiles.has(selectedFilePath) && (
                  <span className="w-2 h-2 rounded-full bg-chart-3 ml-1"></span>
                )}
              </div>
            ) : (
              <div className="px-4 text-xs text-muted-foreground italic">No file open</div>
            )}
            <div className="flex-1"></div>
            {selectedFilePath && (
               <button 
                onClick={handleSave}
                disabled={!unsavedFiles.has(selectedFilePath)}
                className={cn(
                  "px-3 h-full flex items-center border-l border-border transition-colors",
                  unsavedFiles.has(selectedFilePath) ? "text-primary hover:bg-primary/10" : "text-muted-foreground opacity-50"
                )}
              >
                 <Save className="w-4 h-4" />
               </button>
            )}
          </div>
          
          {/* Monaco Editor */}
          <div className="flex-1 relative">
            {isFileLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] z-10"><Spinner /></div>
            ) : selectedFilePath ? (
              <Editor
                height="100%"
                language={getLanguageFromPath(selectedFilePath)}
                theme="vs-dark"
                value={fileContents[selectedFilePath] ?? ''}
                onChange={handleEditorChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: 'JetBrains Mono, monospace',
                  wordWrap: 'on',
                  padding: { top: 16 }
                }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <LayoutPanelLeft className="w-16 h-16 mb-4 opacity-20" />
                <p>Select a file from the explorer to start coding.</p>
              </div>
            )}
          </div>

          {/* Terminal / Output */}
          <div className="h-48 border-t border-border bg-sidebar flex flex-col shrink-0 relative group">
            <div className="ide-panel-header absolute top-0 left-0 w-full z-10 bg-sidebar/90 backdrop-blur justify-between">
              <span>Terminal Output</span>
              <button onClick={() => setTerminalLog("")} className="text-xs hover:text-foreground">Clear</button>
            </div>
            <textarea 
              readOnly 
              value={terminalLog}
              className="flex-1 w-full bg-transparent border-none outline-none resize-none p-4 pt-12 font-mono text-xs text-muted-foreground focus:ring-0 focus:outline-none"
            />
          </div>
        </div>

        {/* Right Sidebar - Tools (Preview & Database) */}
        <div className="w-[450px] border-l border-border bg-card flex flex-col shrink-0">
          <Tabs defaultValue="preview" className="flex-1 flex flex-col">
            <TabsList className="h-10 bg-sidebar border-b border-border rounded-none justify-start px-2 space-x-2">
              <TabsTrigger value="preview" className="data-[state=active]:bg-card data-[state=active]:border-t-2 data-[state=active]:border-primary rounded-none h-full border-t-2 border-transparent">
                Browser Preview
              </TabsTrigger>
              <TabsTrigger value="database" className="data-[state=active]:bg-card data-[state=active]:border-t-2 data-[state=active]:border-primary rounded-none h-full border-t-2 border-transparent">
                Database (SQL)
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="preview" className="flex-1 m-0 flex flex-col outline-none">
              <div className="h-10 border-b border-border flex items-center px-3 space-x-2 bg-muted/30 shrink-0">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPreviewKey(k => k + 1)}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <div className="flex-1 bg-background border border-border rounded h-6 px-2 text-xs flex items-center text-muted-foreground truncate font-mono">
                  {selectedFilePath?.endsWith('.php') ? `localhost/${selectedFilePath}` : 'Preview rendered HTML here'}
                </div>
              </div>
              <div className="flex-1 bg-white relative">
                {previewHtml ? (
                  <iframe 
                    key={previewKey}
                    srcDoc={previewHtml} 
                    className="w-full h-full border-none"
                    sandbox="allow-scripts allow-forms allow-popups"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                    Run a PHP script to view output
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="database" className="flex-1 m-0 flex flex-col outline-none p-4 overflow-y-auto space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Database</label>
                <div className="flex space-x-2">
                  <select 
                    className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedDb}
                    onChange={(e) => setSelectedDb(e.target.value)}
                  >
                    <option value="" disabled>-- Select DB --</option>
                    {dbs?.map(db => <option key={db.id} value={db.dbName}>{db.dbName}</option>)}
                  </select>
                  <Button variant="outline" size="icon" onClick={handleCreateDb} title="Create Database" className="shrink-0">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {selectedDb && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex justify-between">
                      <span>SQL Editor</span>
                      {tables && tables.length > 0 && <span className="normal-case font-normal text-chart-1">{tables.length} tables found</span>}
                    </label>
                    <Textarea 
                      value={sqlQuery}
                      onChange={(e) => setSqlQuery(e.target.value)}
                      className="font-mono text-xs min-h-[120px] bg-[#1e1e1e] border-border text-primary-foreground focus-visible:ring-primary/50"
                      placeholder="Enter SQL query..."
                    />
                    <div className="flex justify-end">
                      <Button onClick={handleRunQuery} disabled={runQueryMutation.isPending} size="sm">
                        {runQueryMutation.isPending ? <Spinner size="sm" className="mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                        Run Query
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 flex-1 flex flex-col min-h-[200px]">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Results</label>
                    <div className="flex-1 border border-border rounded-md overflow-hidden bg-background relative">
                      {queryResult ? (
                        <div className="absolute inset-0 overflow-auto">
                          {queryResult.error ? (
                            <div className="p-4 text-sm text-destructive font-mono">{queryResult.error}</div>
                          ) : (
                            <table className="w-full text-sm text-left relative">
                              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
                                <tr>
                                  {queryResult.columns.map((col: string) => (
                                    <th key={col} className="px-4 py-2 font-medium">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {queryResult.rows.map((row: any, i: number) => (
                                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                                    {queryResult.columns.map((col: string) => (
                                      <td key={`${i}-${col}`} className="px-4 py-2 font-mono text-xs">{String(row[col] ?? 'NULL')}</td>
                                    ))}
                                  </tr>
                                ))}
                                {queryResult.rows.length === 0 && (
                                  <tr>
                                    <td colSpan={queryResult.columns.length} className="px-4 py-4 text-center text-muted-foreground italic">
                                      Query successful. {queryResult.rowCount} rows affected.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground italic">
                          No results yet
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

      </div>
    </div>
  );
}
