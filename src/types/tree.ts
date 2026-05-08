export interface TreeNodeData {
  id: number;
  name: string;
  children: TreeNodeData[];
  floodPolicy: 'allow' | 'deny';
  transport_key?: string;
  last_used?: Date;
  parent_id?: number;
}
