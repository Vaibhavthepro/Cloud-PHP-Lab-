import React, { useState } from 'react';
import { ChevronRight, ChevronDown, FileCode2, FileText, Folder, File, FolderOpen, MoreVertical } from 'lucide-react';
import { FileNode } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface FileTreeProps {
  nodes: FileNode[];
  onSelect: (path: string) => void;
  selectedPath: string | null;
  onAction: (action: 'new-file' | 'new-folder' | 'rename' | 'delete', path: string) => void;
}

export function FileTree({ nodes, onSelect, selectedPath, onAction }: FileTreeProps) {
  // Sort: Directories first, then files, alphabetically
  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });

  return (
    <div className="w-full text-sm font-mono flex flex-col">
      {sortedNodes.map((node) => (
        <FileTreeNode 
          key={node.path} 
          node={node} 
          onSelect={onSelect} 
          selectedPath={selectedPath} 
          onAction={onAction}
          depth={0} 
        />
      ))}
      {nodes.length === 0 && (
        <div className="px-4 py-8 text-center text-muted-foreground text-xs italic">
          Workspace is empty
        </div>
      )}
    </div>
  );
}

interface FileTreeNodeProps {
  node: FileNode;
  onSelect: (path: string) => void;
  selectedPath: string | null;
  onAction: (action: 'new-file' | 'new-folder' | 'rename' | 'delete', path: string) => void;
  depth: number;
}

function FileTreeNode({ node, onSelect, selectedPath, onAction, depth }: FileTreeNodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isSelected = selectedPath === node.path;
  const isDir = node.type === 'directory';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDir) {
      setIsOpen(!isOpen);
    } else {
      onSelect(node.path);
    }
  };

  const getIcon = () => {
    if (isDir) return isOpen ? <FolderOpen className="w-4 h-4 text-primary" /> : <Folder className="w-4 h-4 text-primary/70" />;
    if (node.name.endsWith('.php')) return <FileCode2 className="w-4 h-4 text-indigo-400" />;
    if (node.name.endsWith('.css') || node.name.endsWith('.js') || node.name.endsWith('.html')) return <FileCode2 className="w-4 h-4 text-chart-3" />;
    if (node.name.endsWith('.sql')) return <FileText className="w-4 h-4 text-chart-2" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="select-none">
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              "flex items-center py-1 cursor-pointer hover:bg-muted/50 transition-colors group",
              isSelected ? "bg-primary/20 text-primary hover:bg-primary/25" : "text-foreground"
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: '8px' }}
            onClick={handleClick}
          >
            <span className="w-4 h-4 mr-1 flex items-center justify-center text-muted-foreground">
              {isDir && (isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
            </span>
            <span className="mr-2">{getIcon()}</span>
            <span className="truncate flex-1">{node.name}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48 bg-card border-border">
          {isDir && (
            <>
              <ContextMenuItem onClick={() => onAction('new-file', node.path)}>New File</ContextMenuItem>
              <ContextMenuItem onClick={() => onAction('new-folder', node.path)}>New Folder</ContextMenuItem>
              <ContextMenuSeparator className="bg-border" />
            </>
          )}
          <ContextMenuItem onClick={() => onAction('rename', node.path)}>Rename</ContextMenuItem>
          <ContextMenuItem className="text-destructive focus:bg-destructive/10" onClick={() => onAction('delete', node.path)}>
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isDir && isOpen && node.children && (
        <div>
          {node.children
            .sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === 'directory' ? -1 : 1;
            })
            .map(child => (
              <FileTreeNode
                key={child.path}
                node={child}
                onSelect={onSelect}
                selectedPath={selectedPath}
                onAction={onAction}
                depth={depth + 1}
              />
          ))}
        </div>
      )}
    </div>
  );
}
