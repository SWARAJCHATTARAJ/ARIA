from __future__ import annotations

import math
from html import escape
from .core import ResearchResult, Evidence

def generate_network_svg(result: ResearchResult) -> str:
    """Generates an SVG layout representing queries and retrieved evidence nodes."""
    if not result or not result.evidence:
        return """
        <div style="text-align: center; padding: 40px; color: #64748b; font-family: 'Outfit', sans-serif; border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px; background: rgba(10,25,47,0.15);">
            <p style="margin: 0; font-size: 14px; font-weight: 500;">No evidence collected yet. Run research to view the Evidence Network.</p>
        </div>
        """
        
    queries = result.plan or ["General Inquiry"]
    evidence = result.evidence
    
    evidence_by_query: dict[str, list[Evidence]] = {q: [] for q in queries}
    evidence_by_query["General"] = []
    
    for ev in evidence:
        q = getattr(ev, "query", None)
        if q in evidence_by_query:
            evidence_by_query[q].append(ev)
        else:
            matched = False
            for query_text in queries:
                words = [w.lower() for w in query_text.split() if len(w) > 4]
                if words and any(word in ev.title.lower() or word in ev.summary.lower() for word in words):
                    evidence_by_query[query_text].append(ev)
                    matched = True
                    break
            if not matched:
                if queries:
                    shortest_q = min(queries, key=lambda key_q: len(evidence_by_query[key_q]))
                    evidence_by_query[shortest_q].append(ev)
                else:
                    evidence_by_query["General"].append(ev)
                    
    if queries and not evidence_by_query["General"]:
        evidence_by_query.pop("General", None)
        
    active_queries = list(evidence_by_query.keys())
    n_queries = len(active_queries)
    
    width = 900
    height = 450
    cx, cy = width // 2, height // 2
    
    svg_elements = []
    
    style_def = """
    <style>
        .edge-center {
            stroke: #00e6ff;
            stroke-width: 1.5;
            stroke-dasharray: 4 4;
            stroke-opacity: 0.5;
            animation: dash 35s linear infinite;
        }
        @keyframes dash {
            to { stroke-dashoffset: -1000; }
        }
        .edge-evidence {
            stroke: #1e293b;
            stroke-width: 1;
            stroke-opacity: 0.35;
            transition: stroke 0.3s ease, stroke-width 0.3s ease, stroke-opacity 0.3s ease;
        }
        .node-center {
            fill: #020712;
            stroke: #00e6ff;
            stroke-width: 3;
            filter: drop-shadow(0 0 8px rgba(0, 230, 255, 0.45));
        }
        .node-query {
            fill: #0c1e36;
            stroke: #3b82f6;
            stroke-width: 2;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
        }
        .node-query:hover {
            stroke: #60a5fa;
            filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.5));
        }
        .node-evidence {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            stroke: rgba(255, 255, 255, 0.2);
            stroke-width: 1;
        }
        .node-evidence:hover {
            stroke: #ffffff;
            stroke-width: 2;
            filter: drop-shadow(0 0 6px currentColor);
        }
        .node-text {
            font-family: 'Outfit', sans-serif;
            fill: #cbd5e1;
            font-size: 10px;
            pointer-events: none;
            text-anchor: middle;
            font-weight: 600;
        }
        .node-text-center {
            font-family: 'Outfit', sans-serif;
            fill: #ffffff;
            font-size: 11px;
            font-weight: 800;
            pointer-events: none;
            text-anchor: middle;
            letter-spacing: 0.08em;
        }
        .node-text-query {
            font-family: 'Outfit', sans-serif;
            fill: #94a3b8;
            font-size: 9px;
            pointer-events: none;
            text-anchor: middle;
            font-weight: 500;
        }
    </style>
    """
    svg_elements.append(style_def)
    
    colors_map = {
        "wikipedia": "#00a2ff",
        "local": "#10b981",
        "pdf": "#10b981",
        "research": "#a855f7",
        "web": "#f59e0b",
        "finance": "#ec4899",
        "note": "#06b6d4",
        "system": "#ef4444"
    }
    
    r_queries = 125
    r_evidence = 205
    
    query_positions = {}
    
    for idx, q in enumerate(active_queries):
        angle = idx * (2 * math.pi / n_queries) if n_queries > 0 else 0
        qx = cx + r_queries * math.cos(angle)
        qy = cy + r_queries * math.sin(angle)
        query_positions[q] = (qx, qy, angle)
        svg_elements.append(f'<line x1="{cx}" y1="{cy}" x2="{qx}" y2="{qy}" class="edge-center" />')
        
    for q_idx, q in enumerate(active_queries):
        qx, qy, q_angle = query_positions[q]
        ev_list = evidence_by_query[q]
        n_ev = len(ev_list)
        
        if n_ev == 0:
            continue
            
        fan_width = (2 * math.pi / n_queries) * 0.85 if n_queries > 1 else math.pi * 1.6
        start_angle = q_angle - fan_width / 2
        
        for ev_idx, ev in enumerate(ev_list):
            if n_ev > 1:
                ev_angle = start_angle + ev_idx * (fan_width / (n_ev - 1))
            else:
                ev_angle = q_angle
                
            ex = cx + r_evidence * math.cos(ev_angle)
            ey = cy + r_evidence * math.sin(ev_angle)
            
            svg_elements.append(
                f'<line x1="{qx}" y1="{qy}" x2="{ex}" y2="{ey}" class="edge-evidence" id="edge-{q_idx}-{ev_idx}" />'
            )
            
            ev_color = colors_map.get(ev.source_type.lower(), "#64748b")
            title_escaped = escape(ev.title)
            summary_escaped = escape(ev.summary[:200] + "...")
            tooltip = f"Title: {title_escaped}\nType: {ev.source_type.upper()}\nScore: {ev.score:.2f}\nProvenance: {ev.retrieved_via}\n\nSummary:\n{summary_escaped}"
            
            svg_elements.append(
                f'<g class="node-group" '
                f'onmouseover="document.getElementById(\'edge-{q_idx}-{ev_idx}\').style.stroke=\'{ev_color}\'; document.getElementById(\'edge-{q_idx}-{ev_idx}\').style.strokeOpacity=\'0.85\'; document.getElementById(\'edge-{q_idx}-{ev_idx}\').style.strokeWidth=\'2\';" '
                f'onmouseout="document.getElementById(\'edge-{q_idx}-{ev_idx}\').style.stroke=\'#1e293b\'; document.getElementById(\'edge-{q_idx}-{ev_idx}\').style.strokeOpacity=\'0.35\'; document.getElementById(\'edge-{q_idx}-{ev_idx}\').style.strokeWidth=\'1\';">'
                f'<circle cx="{ex}" cy="{ey}" r="8" fill="{ev_color}" class="node-evidence" style="color: {ev_color};">'
                f'<title>{tooltip}</title>'
                f'</circle>'
                f'</g>'
            )
            
    for idx, q in enumerate(active_queries):
        qx, qy, _ = query_positions[q]
        q_label = q[:16] + "..." if len(q) > 16 else q
        tooltip = f"Search Query {idx+1}:\n{escape(q)}\n\nEvidence items: {len(evidence_by_query[q])}"
        
        svg_elements.append(
            f'<g>'
            f'<circle cx="{qx}" cy="{qy}" r="18" class="node-query">'
            f'<title>{tooltip}</title>'
            f'</circle>'
            f'<text x="{qx}" y="{qy + 3}" class="node-text" style="fill: #60a5fa;">Q{idx+1}</text>'
            f'<text x="{qx}" y="{qy + 28}" class="node-text-query">{escape(q_label)}</text>'
            f'</g>'
        )
        
    svg_elements.append(
        f'<g>'
        f'<circle cx="{cx}" cy="{cy}" r="30" class="node-center" />'
        f'<text x="{cx}" y="{cy + 4}" class="node-text-center" fill="#00e6ff">ARIA</text>'
        f'</g>'
    )
    
    return f'<svg viewBox="0 0 {width} {height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background: rgba(10, 25, 47, 0.15); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">{"".join(svg_elements)}</svg>'


def generate_source_mix_svg(result: ResearchResult) -> str:
    """Generates an SVG donut chart showing source distribution."""
    if not result or not result.evidence:
        return ""
        
    from collections import Counter
    counts = Counter(item.source_type for item in result.evidence)
    total = sum(counts.values())
    
    if total == 0:
        return ""
        
    colors_map = {
        "wikipedia": "#00a2ff",
        "local": "#10b981",
        "pdf": "#10b981",
        "research": "#a855f7",
        "web": "#f59e0b",
        "finance": "#ec4899",
        "note": "#06b6d4",
        "system": "#ef4444"
    }
    
    width = 300
    height = 180
    cx, cy = 90, 90
    r = 62
    stroke_width = 14
    
    svg_elements = []
    current_angle = -math.pi / 2
    legend_elements = []
    
    for idx, (source, count) in enumerate(counts.items()):
        color = colors_map.get(source.lower(), "#64748b")
        percentage = (count / total) * 100
        angle_sweep = (count / total) * 2 * math.pi
        
        end_angle = current_angle + angle_sweep
        x1 = cx + r * math.cos(current_angle)
        y1 = cy + r * math.sin(current_angle)
        x2 = cx + r * math.cos(end_angle)
        y2 = cy + r * math.sin(end_angle)
        
        large_arc_flag = 1 if angle_sweep > math.pi else 0
        
        if percentage >= 99.9:
            svg_elements.append(
                f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="{stroke_width}" />'
            )
        else:
            path_str = f"M {x1} {y1} A {r} {r} 0 {large_arc_flag} 1 {x2} {y2}"
            svg_elements.append(
                f'<path d="{path_str}" fill="none" stroke="{color}" stroke-width="{stroke_width}" stroke-linecap="round" />'
            )
            
        current_angle = end_angle
        
        ly = 20 + idx * 22
        legend_elements.append(
            f'<g>'
            f'<rect x="180" y="{ly}" width="10" height="10" rx="3" fill="{color}" />'
            f'<text x="198" y="{ly + 9}" font-family="\'Outfit\', sans-serif" font-size="10.5" fill="#cbd5e1" font-weight="600">{source.upper()}</text>'
            f'<text x="290" y="{ly + 9}" font-family="\'Outfit\', sans-serif" font-size="10" fill="#94a3b8" text-anchor="end">{count} ({percentage:.0f}%)</text>'
            f'</g>'
        )
        
    svg_elements.append(
        f'<circle cx="{cx}" cy="{cy}" r="{r - stroke_width}" fill="#0a192f" opacity="0.3" />'
        f'<text x="{cx}" y="{cy - 4}" font-family="\'Outfit\', sans-serif" font-size="18" font-weight="800" fill="#ffffff" text-anchor="middle">{total}</text>'
        f'<text x="{cx}" y="{cy + 10}" font-family="\'Outfit\', sans-serif" font-size="8" fill="#94a3b8" font-weight="800" text-transform="uppercase" letter-spacing="0.08em" text-anchor="middle">Sources</text>'
    )
    
    svg_elements.extend(legend_elements)
    
    return f'<svg viewBox="0 0 {width} {height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">{"".join(svg_elements)}</svg>'


def generate_relevance_dist_svg(result: ResearchResult) -> str:
    """Generates an SVG chart showing relevance score distributions."""
    if not result or not result.evidence:
        return ""
        
    scores = [getattr(item, "score", 0.75) for item in result.evidence]
    if not scores:
        return ""
        
    ranges = {
        "High (0.8-1.0)": sum(1 for s in scores if s >= 0.8),
        "Medium (0.6-0.8)": sum(1 for s in scores if 0.6 <= s < 0.8),
        "Low (0.4-0.6)": sum(1 for s in scores if 0.4 <= s < 0.6),
        "Unreliable (<0.4)": sum(1 for s in scores if s < 0.4),
    }
    
    width = 300
    height = 180
    svg_elements = []
    
    colors_map = {
        "High (0.8-1.0)": "#10b981",
        "Medium (0.6-0.8)": "#3b82f6",
        "Low (0.4-0.6)": "#f59e0b",
        "Unreliable (<0.4)": "#ef4444",
    }
    
    max_count = max(ranges.values()) or 1
    
    for idx, (label, count) in enumerate(ranges.items()):
        color = colors_map[label]
        y = 15 + idx * 40
        bar_width = int((count / max_count) * 155) if count > 0 else 2
        
        svg_elements.append(
            f'<g>'
            f'<text x="10" y="{y + 12}" font-family="\'Outfit\', sans-serif" font-size="9.5" fill="#94a3b8" font-weight="600">{label}</text>'
            f'<rect x="110" y="{y}" width="155" height="15" rx="3.5" fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.04)" />'
            f'<rect x="110" y="{y}" width="{bar_width}" height="15" rx="3.5" fill="{color}" opacity="0.8" />'
            f'<text x="{115 + bar_width}" y="{y + 11}" font-family="\'Outfit\', sans-serif" font-size="9.5" font-weight="800" fill="#ffffff">{count}</text>'
            f'</g>'
        )
        
    return f'<svg viewBox="0 0 {width} {height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">{"".join(svg_elements)}</svg>'
