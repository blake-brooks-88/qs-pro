# Canvas Performance Standards (React Flow)

> **Critical:** These rules are mandatory for the app's main feature. Non-compliance will be rejected.

---

## 1. Memoization of Custom Nodes and Edges (Mandatory)

### Rule
All custom nodes and edges **must** be wrapped in `React.memo`.

### Why
React Flow re-renders nodes and edges frequently. Without memoization, every canvas interaction (zoom, pan, drag) triggers unnecessary re-renders of all nodes/edges.

### Examples

**✅ Custom Node (Correct):**
```typescript
// components/canvas/EntityNode.tsx
interface EntityNodeProps {
  data: EntityNodeData
  id: string
}

const EntityNode: React.FC<EntityNodeProps> = ({ data, id }) => {
  return (
    <div className="entity-node">
      <Handle type="target" position={Position.Top} />
      <div className="entity-node-content">
        <h3>{data.label}</h3>
        <p>{data.description}</p>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}

// ✅ MUST wrap in React.memo
export default React.memo(EntityNode)
```

**✅ Custom Edge (Correct):**
```typescript
// components/canvas/FeedsIntoEdge.tsx
interface FeedsIntoEdgeProps extends EdgeProps {
  data?: EdgeData
}

const FeedsIntoEdge: React.FC<FeedsIntoEdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data
}) => {
  const edgePath = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY
  })

  return (
    <>
      <path className="feeds-into-edge" d={edgePath} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div className="edge-label">{data.label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// ✅ MUST wrap in React.memo
export default React.memo(FeedsIntoEdge)
```

**❌ Without Memoization (Wrong):**
```typescript
// ❌ Re-renders on every canvas interaction
export default EntityNode
```

---

## 2. Handler and Prop Memoization (Mandatory)

### Rule
All event handlers and object/array props passed to `<ReactFlow>` **must** be memoized.

### Why
React Flow compares props by reference. If handlers or objects are recreated on every render, React Flow assumes they changed and re-renders the entire canvas.

### Examples

**✅ Event Handlers with `useCallback`:**
```typescript
function EntityCanvas() {
  const updateNode = useEntityStore(s => s.updateNode)

  // ✅ MUST use useCallback
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      console.log('Node clicked:', node.id)
      updateNode(node.id, { selected: true })
    },
    [updateNode]
  )

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      console.log('Edge clicked:', edge.id)
    },
    []
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}  // ✅ Memoized
      onEdgeClick={onEdgeClick}  // ✅ Memoized
    />
  )
}
```

**✅ Object/Array Props with `useMemo`:**
```typescript
function EntityCanvas() {
  // ✅ MUST use useMemo for objects
  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'feedsInto',
      animated: true,
      style: { stroke: '#888' }
    }),
    []
  )

  // ✅ MUST use useMemo for node types
  const nodeTypes = useMemo(
    () => ({
      entity: EntityNode,
      group: GroupNode
    }),
    []
  )

  // ✅ MUST use useMemo for edge types
  const edgeTypes = useMemo(
    () => ({
      feedsInto: FeedsIntoEdge,
      relationship: RelationshipEdge
    }),
    []
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}            // ✅ Memoized
      edgeTypes={edgeTypes}            // ✅ Memoized
      defaultEdgeOptions={defaultEdgeOptions}  // ✅ Memoized
    />
  )
}
```

**❌ Without Memoization (Wrong):**
```typescript
function EntityCanvas() {
  // ❌ New reference on every render → full canvas re-render
  const onNodeClick = (event: React.MouseEvent, node: Node) => {
    console.log('Node clicked:', node.id)
  }

  // ❌ New object on every render → full canvas re-render
  const defaultEdgeOptions = {
    type: 'feedsInto',
    animated: true
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}  // ❌ Not memoized
      defaultEdgeOptions={defaultEdgeOptions}  // ❌ Not memoized
    />
  )
}
```

---

## 3. Granular Selectors for Zustand (Mandatory)

### Rule
Components **outside** the canvas (e.g., sidebar, inspector) must use granular selectors. Never subscribe to entire `nodes` or `edges` arrays.

### Why
Subscribing to the entire array causes re-renders on **any** node/edge change, even if the component only cares about one specific node.

### Examples

**✅ Granular Selector (Correct):**
```typescript
// Sidebar that shows details of selected node
function NodeInspector() {
  const selectedNodeId = useEntityStore(s => s.selectedNodeId)

  // ✅ Only subscribes to the specific node we care about
  const selectedNode = useEntityStore(
    useCallback(
      (state) => state.nodes.find(n => n.id === selectedNodeId),
      [selectedNodeId]
    )
  )

  if (!selectedNode) {
    return <div>No node selected</div>
  }

  return (
    <div className="node-inspector">
      <h3>{selectedNode.data.label}</h3>
      <p>{selectedNode.data.description}</p>
    </div>
  )
}
```

**✅ With Memoized Selector Function:**
```typescript
// Create reusable selector
const selectNodeById = (nodeId: string | null) => (state: EntityStore) =>
  nodeId ? state.nodes.find(n => n.id === nodeId) : null

function NodeInspector() {
  const selectedNodeId = useEntityStore(s => s.selectedNodeId)
  const selectedNode = useEntityStore(selectNodeById(selectedNodeId))

  // Component only re-renders when the specific node changes
  return <div>{selectedNode?.data.label}</div>
}
```

**❌ Subscribing to Entire Array (Wrong):**
```typescript
function NodeInspector() {
  const selectedNodeId = useEntityStore(s => s.selectedNodeId)

  // ❌ Re-renders when ANY node changes, even unrelated ones
  const nodes = useEntityStore(s => s.nodes)
  const selectedNode = nodes.find(n => n.id === selectedNodeId)

  return <div>{selectedNode?.data.label}</div>
}
```

**❌ Subscribing to Entire Store (Wrong):**
```typescript
function NodeInspector() {
  // ❌ Re-renders on ANY store change (nodes, edges, selections, etc.)
  const store = useEntityStore()
  const selectedNode = store.nodes.find(n => n.id === store.selectedNodeId)

  return <div>{selectedNode?.data.label}</div>
}
```

---

## Performance Checklist

Before submitting code that touches the canvas:

- [ ] All custom nodes wrapped in `React.memo`
- [ ] All custom edges wrapped in `React.memo`
- [ ] All event handlers passed to `<ReactFlow>` use `useCallback`
- [ ] All object/array props passed to `<ReactFlow>` use `useMemo`
- [ ] Components outside canvas use granular Zustand selectors
- [ ] No components subscribe to entire `nodes` or `edges` arrays unnecessarily

---

## Common Patterns

### Pattern 1: Canvas Component
```typescript
function EntityCanvas() {
  const nodes = useEntityStore(s => s.nodes)
  const edges = useEntityStore(s => s.edges)
  const updateNode = useEntityStore(s => s.updateNode)

  // ✅ Memoize handlers
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      updateNode(node.id, { selected: true })
    },
    [updateNode]
  )

  // ✅ Memoize object props
  const nodeTypes = useMemo(() => ({ entity: EntityNode }), [])
  const edgeTypes = useMemo(() => ({ feedsInto: FeedsIntoEdge }), [])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onNodeClick}
    />
  )
}
```

### Pattern 2: Sidebar Inspector
```typescript
function EntityInspector() {
  const selectedNodeId = useEntityStore(s => s.selectedNodeId)

  // ✅ Granular selector
  const selectedNode = useEntityStore(
    useCallback(
      (state) => state.nodes.find(n => n.id === selectedNodeId),
      [selectedNodeId]
    )
  )

  return <div>{selectedNode?.data.label}</div>
}
```

---

## Summary

| Component | Memoization Required | Tool |
|-----------|---------------------|------|
| Custom Nodes | Yes | `React.memo` |
| Custom Edges | Yes | `React.memo` |
| Event Handlers | Yes | `useCallback` |
| Object/Array Props | Yes | `useMemo` |
| Zustand Selectors (outside canvas) | Yes (granular) | Selector functions |
