import yaml
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime
import os

class OKFFrontmatter(BaseModel):
    id: str
    type: str # definition, finding, note, source-summary, method
    topic: List[str]
    title: str
    created: datetime
    updated: datetime
    source: Optional[str] = None
    related: List[str] = Field(default_factory=list) # Relative paths
    owner: str # shared, personal
    confidence: str # verified, draft

    @validator("type")
    def validate_type(cls, v):
        allowed = ["definition", "finding", "note", "source-summary", "method"]
        if v not in allowed:
            raise ValueError(f"type must be one of {allowed}")
        return v

    @validator("owner")
    def validate_owner(cls, v):
        allowed = ["shared", "personal"]
        if v not in allowed:
            raise ValueError(f"owner must be one of {allowed}")
        return v
        
    @validator("confidence")
    def validate_confidence(cls, v):
        allowed = ["verified", "draft"]
        if v not in allowed:
            raise ValueError(f"confidence must be one of {allowed}")
        return v

def parse_okf_file(file_path: str) -> dict:
    """
    Parses an OKF Markdown file, extracting the YAML frontmatter and the content.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if not content.startswith("---"):
        raise ValueError(f"File {file_path} does not contain YAML frontmatter.")
        
    parts = content.split("---", 2)
    if len(parts) < 3:
        raise ValueError(f"File {file_path} has malformed frontmatter.")
        
    frontmatter_yaml = parts[1].strip()
    markdown_content = parts[2].strip()
    
    parsed_yaml = yaml.safe_load(frontmatter_yaml)
    
    # Validate with Pydantic
    frontmatter = OKFFrontmatter(**parsed_yaml)
    
    return {
        "metadata": frontmatter.dict(),
        "content": markdown_content
    }
