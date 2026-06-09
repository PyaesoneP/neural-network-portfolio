#!/usr/bin/env python3
"""
Resume → Network JSON Generator
--------------------------------
Extracts skills, education, projects, and experience from a resume
and generates the data/network.json for the neural network portfolio.

Usage:
    python scripts/resume_to_network.py resume.pdf                    # auto-detect LLM
    python scripts/resume_to_network.py resume.pdf --llm openai       # use OpenAI
    python scripts/resume_to_network.py resume.pdf --llm ollama       # use local Ollama
    python scripts/resume_to_network.py resume.txt --output data/custom.json

Supported input: .pdf, .docx, .txt
Supported LLMs: openai (GPT-4o-mini), ollama (local), none (template-based)
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

# ── Text Extraction ──────────────────────────────────────────────

def extract_text_pdf(filepath: str) -> str:
    """Extract text from a PDF file."""
    try:
        import pdfplumber
        text = []
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text.append(t)
        return "\n\n".join(text)
    except ImportError:
        pass
    try:
        from pypdf import PdfReader
        reader = PdfReader(filepath)
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    except ImportError:
        pass
    raise ImportError(
        "Install a PDF library: pip install pdfplumber  OR  pip install pypdf"
    )


def extract_text_docx(filepath: str) -> str:
    """Extract text from a DOCX file."""
    from docx import Document
    doc = Document(filepath)
    return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())


def extract_text_txt(filepath: str) -> str:
    """Read plain text file."""
    return Path(filepath).read_text(encoding="utf-8")


def extract_text(filepath: str) -> str:
    """Auto-detect format and extract text."""
    ext = Path(filepath).suffix.lower()
    if ext == ".pdf":
        return extract_text_pdf(filepath)
    elif ext == ".docx":
        return extract_text_docx(filepath)
    elif ext in (".txt", ".md", ""):
        return extract_text_txt(filepath)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


# ── LLM-based Extraction ─────────────────────────────────────────

SYSTEM_PROMPT = """You are a precise data extraction tool. Given a resume, output ONLY valid JSON matching this exact schema:

{
  "layers": [
    {
      "id": "input",
      "label": "Education & Background",
      "colorVar": "--color-input",
      "nodes": [
        {
          "id": "unique_snake_case_id",
          "name": "Display Name",
          "icon": "fa-icon-name",
          "description": "1-2 sentence description with key metrics",
          "tags": ["Tag1", "Tag2"],
          "activation": 0.85,
          "year": 2023
        }
      ]
    }
  ],
  "connections": [
    { "from": "source_node_id", "to": "target_node_id", "strength": 0.8 }
  ]
}

RULES:
- 5 layers: input (education/background), hidden1 (foundation skills), hidden2 (core AI/ML skills), hidden3 (specialized expertise), output (projects & experience)
- 4-6 nodes per layer
- id: lowercase_snake_case, unique across all layers
- icon: Font Awesome 6 class without 'fa-' prefix (e.g., "fa-python", "fa-brain", "fa-shield-halved")
- activation: 0.7-0.98 representing proficiency/impact
- year: integer year
- tags: 3-4 short strings
- connections: link related nodes across layers with strength 0.6-0.98
- Include ALL skills, education entries, projects, and experiences found in the resume
- Prefer specific metrics (e.g., "99.8% accuracy", "CGPA 3.94")

OUTPUT ONLY THE JSON OBJECT. NO MARKDOWN, NO EXPLANATION."""


def extract_with_openai(text: str, api_key: str | None = None) -> dict:
    """Use OpenAI GPT-4o-mini to extract structured data."""
    from openai import OpenAI
    client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Extract structured data from this resume:\n\n{text[:8000]}"}
        ],
        temperature=0.1,
        max_tokens=4096,
    )
    raw = response.choices[0].message.content.strip()
    # Strip markdown code fences if present
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    return json.loads(raw)


def extract_with_ollama(text: str, model: str = "llama3.1:8b") -> dict:
    """Use local Ollama to extract structured data."""
    import httpx
    response = httpx.post(
        "http://localhost:11434/api/generate",
        json={
            "model": model,
            "system": SYSTEM_PROMPT,
            "prompt": f"Extract structured data from this resume:\n\n{text[:8000]}",
            "stream": False,
            "options": {"temperature": 0.1}
        },
        timeout=120
    )
    raw = response.json()["response"].strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    return json.loads(raw)


def extract_with_rules(text: str) -> dict:
    """
    Fallback: heuristic regex-based extraction.
    Generates a sensible template structure from detected keywords.
    """
    text_lower = text.lower()
    
    # ── Detect education entries ──
    education_nodes = []
    edu_patterns = [
        (r'(?:university|college|institute|school)\s+(?:of\s+)?([^.\\n]{5,60})', 2015),
        (r'(?:b\.?eng|bachelor|diploma|mbbs|phd|master|m\.?sc|b\.?sc)\s+(?:in\s+)?([^.\\n]{5,60})', 2023),
    ]
    seen_edu = set()
    for pattern, default_year in edu_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            name = match.group(0).strip()[:50]
            key = name.lower()[:20]
            if key not in seen_edu:
                seen_edu.add(key)
                education_nodes.append({
                    "id": f"edu_{len(seen_edu)}",
                    "name": name,
                    "icon": "fa-building-columns",
                    "description": name,
                    "tags": ["Education"],
                    "activation": 0.9,
                    "year": default_year
                })
    
    # ── Detect skills ──
    skill_map = {
        "python": ("Python", "fa-brands fa-python", 0.95, 2023),
        "javascript|js|node": ("JavaScript", "fa-brands fa-js", 0.8, 2023),
        "pytorch": ("PyTorch", "fa-fire", 0.9, 2025),
        "tensorflow|keras": ("TensorFlow/Keras", "fa-brain", 0.9, 2025),
        "scikit-learn|scikit": ("Scikit-Learn", "fa-chart-line", 0.9, 2025),
        "docker|kubernetes|k8s|container": ("Docker & Kubernetes", "fa-docker", 0.85, 2025),
        "aws|azure|gcp|cloud": ("Cloud Platform", "fa-cloud", 0.85, 2025),
        "sql|postgres|mysql": ("SQL", "fa-database", 0.85, 2023),
        "git|github": ("Git/GitHub", "fa-code-branch", 0.9, 2023),
        "nlp|llm|transformer|huggingface": ("NLP & LLMs", "fa-comments", 0.88, 2025),
        "computer vision|cv|opencv": ("Computer Vision", "fa-eye", 0.85, 2025),
        "fastapi|flask|django|api": ("API Development", "fa-server", 0.85, 2023),
        "cybersec|security|pentest|red team": ("Cybersecurity", "fa-shield-halved", 0.85, 2025),
        "mlops|ci/cd|pipeline": ("MLOps", "fa-gears", 0.85, 2025),
        "react|vue|angular|frontend": ("Frontend", "fa-react", 0.8, 2023),
        "rag|agent|llm app": ("RAG & Agents", "fa-robot", 0.85, 2026),
        "prompt engineer|prompting": ("Prompt Engineering", "fa-wand-magic-sparkles", 0.85, 2025),
        "c\\+\\+|c language|embedded": ("C/C++", "fa-c", 0.8, 2023),
        "powershell|bash|shell": ("Scripting", "fa-terminal", 0.85, 2023),
        "pandas|numpy|data analysis": ("Data Analysis", "fa-table", 0.9, 2023),
    }
    
    foundation_nodes = []
    core_nodes = []
    specialized_nodes = []
    found_skills = set()
    
    for pattern, (name, icon, activation, year) in skill_map.items():
        if re.search(pattern, text_lower) and name not in found_skills:
            found_skills.add(name)
            node = {
                "id": re.sub(r'[^a-z0-9_]', '_', name.lower().replace(' ', '_').replace('/', '_'))[:30],
                "name": name,
                "icon": icon,
                "description": f"Proficient in {name}",
                "tags": [name],
                "activation": activation,
                "year": year
            }
            # Categorize
            if any(k in pattern for k in ["python", "javascript", "sql", "git", "docker", "cloud", "c\\+\\+", "powershell", "bash", "pandas", "numpy", "fastapi", "flask", "api"]):
                foundation_nodes.append(node)
            elif any(k in pattern for k in ["pytorch", "tensorflow", "scikit", "nlp", "computer vision", "cv", "mlops", "react", "frontend"]):
                core_nodes.append(node)
            else:
                specialized_nodes.append(node)
    
    # ── Detect projects ──
    project_nodes = []
    proj_pattern = re.finditer(
        r'(?:^|\n)([A-Z][A-Za-z0-9\s\-:&]+(?:Engine|System|Model|Pipeline|Agent|App|Project|Platform|Tool|Classification|Recognition))[.\n]',
        text
    )
    for i, match in enumerate(proj_pattern):
        name = match.group(1).strip()[:50]
        if len(name) > 5:
            project_nodes.append({
                "id": f"project_{i+1}",
                "name": name,
                "icon": "fa-diagram-project",
                "description": name,
                "tags": ["Project"],
                "activation": 0.85,
                "year": 2025
            })
    
    # ── Assemble layers ──
    layers = [
        {
            "id": "input",
            "label": "Education & Background",
            "colorVar": "--color-input",
            "nodes": education_nodes[:5] if education_nodes else [
                {"id": "education", "name": "Education", "icon": "fa-building-columns",
                 "description": "See resume for details", "tags": ["Education"], "activation": 0.9, "year": 2023}
            ]
        },
        {
            "id": "hidden1",
            "label": "Foundation Layer",
            "colorVar": "--color-hidden1",
            "nodes": foundation_nodes[:6] if foundation_nodes else [
                {"id": "python", "name": "Python", "icon": "fa-brands fa-python",
                 "description": "Primary programming language", "tags": ["Python"], "activation": 0.9, "year": 2023}
            ]
        },
        {
            "id": "hidden2",
            "label": "Core AI/ML Skills",
            "colorVar": "--color-hidden2",
            "nodes": core_nodes[:5] if core_nodes else [
                {"id": "ml", "name": "Machine Learning", "icon": "fa-chart-line",
                 "description": "ML fundamentals", "tags": ["ML"], "activation": 0.85, "year": 2025}
            ]
        },
        {
            "id": "hidden3",
            "label": "Specialized Expertise",
            "colorVar": "--color-hidden3",
            "nodes": specialized_nodes[:5] if specialized_nodes else [
                {"id": "specialized", "name": "Specialized Skills", "icon": "fa-star",
                 "description": "Domain expertise", "tags": ["Expertise"], "activation": 0.85, "year": 2025}
            ]
        },
        {
            "id": "output",
            "label": "Projects & Impact",
            "colorVar": "--color-output",
            "nodes": project_nodes[:6] if project_nodes else [
                {"id": "project", "name": "Key Projects", "icon": "fa-diagram-project",
                 "description": "See resume for details", "tags": ["Project"], "activation": 0.85, "year": 2025}
            ]
        }
    ]
    
    # ── Generate connections ──
    connections = []
    all_ids = [n["id"] for layer in layers for n in layer["nodes"]]
    
    # Connect input → hidden1
    for inp in layers[0]["nodes"]:
        for h1 in layers[1]["nodes"][:3]:
            connections.append({"from": inp["id"], "to": h1["id"], "strength": 0.8})
    
    # Connect hidden1 → hidden2
    for h1 in layers[1]["nodes"][:4]:
        for h2 in layers[2]["nodes"][:4]:
            connections.append({"from": h1["id"], "to": h2["id"], "strength": 0.85})
    
    # Connect hidden2 → hidden3
    for h2 in layers[2]["nodes"][:4]:
        for h3 in layers[3]["nodes"][:3]:
            connections.append({"from": h2["id"], "to": h3["id"], "strength": 0.8})
    
    # Connect hidden3 → output
    for h3 in layers[3]["nodes"][:3]:
        for out in layers[4]["nodes"][:4]:
            connections.append({"from": h3["id"], "to": out["id"], "strength": 0.8})
    
    return {"layers": layers, "connections": connections}


# ── Main ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Convert a resume into network.json for the neural network portfolio"
    )
    parser.add_argument("resume", help="Path to resume file (.pdf, .docx, .txt)")
    parser.add_argument(
        "--output", "-o",
        default="data/network.json",
        help="Output JSON path (default: data/network.json)"
    )
    parser.add_argument(
        "--llm",
        choices=["openai", "ollama", "none"],
        default=None,
        help="LLM to use for extraction (default: auto-detect)"
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Model name (OpenAI default: gpt-4o-mini, Ollama default: llama3.1:8b)"
    )
    args = parser.parse_args()
    
    # Extract text
    print(f"📄 Reading: {args.resume}")
    text = extract_text(args.resume)
    print(f"   Extracted {len(text)} characters")
    
    # Auto-detect LLM
    llm = args.llm
    if llm is None:
        if os.getenv("OPENAI_API_KEY"):
            llm = "openai"
            print("🔍 Detected OPENAI_API_KEY — using OpenAI")
        else:
            try:
                import httpx
                r = httpx.get("http://localhost:11434/api/tags", timeout=3)
                if r.status_code == 200:
                    llm = "ollama"
                    print("🔍 Detected local Ollama — using Ollama")
            except Exception:
                pass
        if llm is None:
            llm = "none"
            print("⚠️  No LLM detected — using regex-based extraction (limited accuracy)")
    
    # Extract
    if llm == "openai":
        print("🤖 Extracting with OpenAI...")
        data = extract_with_openai(text)
    elif llm == "ollama":
        model = args.model or "llama3.1:8b"
        print(f"🤖 Extracting with Ollama ({model})...")
        data = extract_with_ollama(text, model)
    else:
        print("🔧 Extracting with regex rules...")
        data = extract_with_rules(text)
    
    # Validate structure
    assert "layers" in data, "Missing 'layers' key"
    assert "connections" in data, "Missing 'connections' key"
    total_nodes = sum(len(layer["nodes"]) for layer in data["layers"])
    print(f"   Generated: {len(data['layers'])} layers, {total_nodes} nodes, {len(data['connections'])} connections")
    
    # Write output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"✅ Written to: {output_path}")
    
    # Quick validation
    node_ids = [n["id"] for layer in data["layers"] for n in layer["nodes"]]
    for conn in data["connections"]:
        if conn["from"] not in node_ids:
            print(f"⚠️  Connection references unknown node: {conn['from']}")
        if conn["to"] not in node_ids:
            print(f"⚠️  Connection references unknown node: {conn['to']}")


if __name__ == "__main__":
    main()
