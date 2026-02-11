import { useMemo, useState } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { eleaFeatureItems } from './eleaFeatureElements'

type Side = 'top' | 'right' | 'bottom' | 'left'

type OrbitNodeData = {
  label: string
  active?: boolean
}

type FeatureNodeType = Node<OrbitNodeData, 'featureNode'>
type CenterNodeType = Node<OrbitNodeData, 'centerNode'>
type OrbitNodeType = FeatureNodeType | CenterNodeType

const centerNodeId = 'elea-center'
const centerPoint = { x: 360, y: 290 }
const innerRingRadius = 185
const outerRingRadius = 250
const centerSize = 136
const featureWidth = 112
const featureHeight = 42

const toSide = (dx: number, dy: number): { feature: Side; center: Side } => {
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) {
      return { feature: 'left', center: 'right' }
    }
    return { feature: 'right', center: 'left' }
  }
  if (dy > 0) {
    return { feature: 'top', center: 'bottom' }
  }
  return { feature: 'bottom', center: 'top' }
}

const FeatureNode = ({ data }: NodeProps<FeatureNodeType>) => {
  return (
    <div className={`elea-orbit-node-pill ${data.active ? 'is-active' : ''}`}>
      <Handle id="top" className="elea-orbit-handle" type="source" position={Position.Top} />
      <Handle id="right" className="elea-orbit-handle" type="source" position={Position.Right} />
      <Handle id="bottom" className="elea-orbit-handle" type="source" position={Position.Bottom} />
      <Handle id="left" className="elea-orbit-handle" type="source" position={Position.Left} />
      <span>{data.label}</span>
    </div>
  )
}

const CenterNode = (_props: NodeProps<CenterNodeType>) => {
  return (
    <div className="elea-orbit-center-chip">
      <Handle id="top" className="elea-orbit-handle elea-orbit-handle-center" type="target" position={Position.Top} />
      <Handle id="right" className="elea-orbit-handle elea-orbit-handle-center" type="target" position={Position.Right} />
      <Handle
        id="bottom"
        className="elea-orbit-handle elea-orbit-handle-center"
        type="target"
        position={Position.Bottom}
      />
      <Handle id="left" className="elea-orbit-handle elea-orbit-handle-center" type="target" position={Position.Left} />
      <img src="/elealogoneu.png" alt="ELEA Logo" />
      <span>ELEA</span>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  featureNode: FeatureNode,
  centerNode: CenterNode,
}

const buildOrbit = (activeFeatureId: string | null): { nodes: OrbitNodeType[]; edges: Edge[] } => {
  const innerRingCount = Math.ceil(eleaFeatureItems.length / 2)
  const outerRingCount = eleaFeatureItems.length - innerRingCount

  const centerNode: CenterNodeType = {
    id: centerNodeId,
    type: 'centerNode',
    data: { label: 'ELEA' },
    position: {
      x: centerPoint.x - centerSize / 2,
      y: centerPoint.y - centerSize / 2,
    },
    draggable: false,
    selectable: false,
    style: {
      width: centerSize,
      height: centerSize,
      border: 'none',
      padding: 0,
      background: 'transparent',
    },
  }

  const featureNodes: FeatureNodeType[] = eleaFeatureItems.map((feature, index) => {
    const isInner = index < innerRingCount
    const localIndex = isInner ? index : index - innerRingCount
    const count = isInner ? innerRingCount : outerRingCount
    const radius = isInner ? innerRingRadius : outerRingRadius
    const angleOffset = isInner ? 0 : Math.PI / count
    const angle = -Math.PI / 2 + angleOffset + (2 * Math.PI * localIndex) / count
    const x = centerPoint.x + Math.cos(angle) * radius
    const y = centerPoint.y + Math.sin(angle) * radius

    return {
      id: feature.id,
      type: 'featureNode',
      data: {
        label: feature.label,
        active: activeFeatureId === feature.id,
      },
      position: {
        x: x - featureWidth / 2,
        y: y - featureHeight / 2,
      },
      draggable: false,
      selectable: true,
      style: {
        width: featureWidth,
        height: featureHeight,
        border: 'none',
        padding: 0,
        background: 'transparent',
      },
    }
  })

  const edges: Edge[] = featureNodes.map((node) => {
    const nodeCenterX = node.position.x + featureWidth / 2
    const nodeCenterY = node.position.y + featureHeight / 2
    const side = toSide(nodeCenterX - centerPoint.x, nodeCenterY - centerPoint.y)

    return {
      id: `lane-${node.id}`,
      source: node.id,
      target: centerNodeId,
      sourceHandle: side.feature,
      targetHandle: side.center,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 13,
        height: 13,
      },
      style: {
        stroke: '#84bcb6',
        strokeWidth: 1.35,
        strokeOpacity: 0.85,
      },
    }
  })

  return {
    nodes: [centerNode, ...featureNodes],
    edges,
  }
}

export const EleaFeatureOrbit = () => {
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null)

  const { nodes, edges } = useMemo(() => buildOrbit(activeFeatureId), [activeFeatureId])
  const activeFeature = useMemo(
    () => eleaFeatureItems.find((feature) => feature.id === activeFeatureId) ?? null,
    [activeFeatureId]
  )

  return (
    <section className="elea-orbit-section" aria-label="Elea Feature Orbit">
      <div className="elea-orbit-head">
        <h4>Elea Feature Universe</h4>
        <p>Klicke auf ein Feature, um die Kurz-Erklaerung zu sehen.</p>
      </div>

      <div className="elea-orbit-flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.05 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          minZoom={0.45}
          maxZoom={1.55}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_event, node) => {
            if (node.id === centerNodeId) {
              setActiveFeatureId(null)
              return
            }
            setActiveFeatureId(node.id)
          }}
        >
          <Background color="rgba(41, 111, 104, 0.15)" gap={24} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>

      <div className={`elea-orbit-mini-card ${activeFeature ? 'is-open' : ''}`}>
        {activeFeature ? (
          <>
            <div className="elea-orbit-mini-head">
              <strong>{activeFeature.label}</strong>
              <button type="button" onClick={() => setActiveFeatureId(null)}>
                Schliessen
              </button>
            </div>
            <p>{activeFeature.description}</p>
          </>
        ) : (
          <p>Waehle ein Feature im Orbit aus.</p>
        )}
      </div>
    </section>
  )
}
