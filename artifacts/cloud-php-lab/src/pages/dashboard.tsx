import { useState } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, FolderGit2, Trash2, Edit2, LogOut, Terminal, Download, Server } from "lucide-react";
import { 
  useListProjects, 
  useCreateProject, 
  useDeleteProject, 
  useUpdateProject, 
  useGetMe,
  useLogout
} from "@workspace/api-client-react";
import { removeToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: user, isLoading: isUserLoading } = useGetMe({ 
    query: { retry: false } 
  });
  
  const { data: projects, isLoading: isProjectsLoading } = useListProjects();
  
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const logout = useLogout();

  const [createOpen, setCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  
  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch (e) {
      // Ignore
    }
    removeToken();
    setLocation("/login");
  };

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    try {
      await createProject.mutateAsync({ data: { projectName: newProjectName } });
      toast({ title: "Project created" });
      setCreateOpen(false);
      setNewProjectName("");
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleRename = async () => {
    if (!renameId || !renameValue.trim()) return;
    try {
      await updateProject.mutateAsync({ 
        projectId: renameId, 
        data: { projectName: renameValue } 
      });
      toast({ title: "Project renamed" });
      setRenameId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this project? This cannot be undone.")) return;
    try {
      await deleteProject.mutateAsync({ projectId: id });
      toast({ title: "Project deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  if (isUserLoading || isProjectsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Nav */}
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center space-x-3 text-primary">
          <Terminal className="w-6 h-6" />
          <h1 className="text-xl font-bold tracking-tight text-foreground">Cloud PHP Lab</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center space-x-2 focus:outline-none hover:opacity-80 transition-opacity">
                <Avatar className="w-8 h-8 border border-border">
                  <AvatarFallback className="bg-primary/20 text-primary font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground hidden sm:block">{user.name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card border-border">
              <DropdownMenuItem className="text-muted-foreground cursor-default focus:bg-transparent">
                {user.email}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 cursor-pointer mt-1">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Your Workspaces</h2>
            <p className="text-muted-foreground mt-1">Manage your PHP projects and databases.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="lg" className="shadow-lg shadow-primary/20">
            <Plus className="w-5 h-5 mr-2" />
            New Project
          </Button>
        </div>

        {projects?.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-2xl p-12 flex flex-col items-center justify-center text-center bg-card/50">
            <div className="bg-muted p-4 rounded-full mb-4">
              <FolderGit2 className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No projects yet</h3>
            <p className="text-muted-foreground max-w-sm mb-6">
              Create your first PHP workspace to start coding, previewing, and managing databases.
            </p>
            <Button onClick={() => setCreateOpen(true)} variant="outline">
              Create Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects?.map((project) => (
              <Card key={project.id} className="bg-card border-border shadow-md hover:shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col group">
                <div className="p-6 flex-1">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="bg-primary/10 p-2.5 rounded-lg text-primary group-hover:scale-110 transition-transform">
                        <Server className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-foreground line-clamp-1" title={project.projectName}>
                          {project.projectName}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {format(new Date(project.createdAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex flex-wrap gap-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border">
                      PHP 8.x
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border">
                      MySQL
                    </span>
                  </div>
                </div>
                
                <div className="border-t border-border px-6 py-4 flex items-center justify-between bg-black/20">
                  <Link href={`/project/${project.id}`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2">
                    Open IDE
                  </Link>
                  <div className="flex items-center space-x-1">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setRenameId(project.id);
                        setRenameValue(project.projectName);
                      }}
                      title="Rename"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(project.id)}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create New Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              placeholder="e.g. blog-app, hw-assignment-1" 
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="bg-background"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <p className="text-xs text-muted-foreground mt-2">Use lowercase letters, numbers, and hyphens.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newProjectName.trim() || createProject.isPending}>
              {createProject.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Modal */}
      <Dialog open={!!renameId} onOpenChange={(open) => !open && setRenameId(null)}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Rename Project</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="bg-background"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameId(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim() || updateProject.isPending}>
              {updateProject.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
