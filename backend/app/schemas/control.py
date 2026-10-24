from typing import Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

class ControlCommandRequest(BaseModel):
    action: Literal["MUTE_BUZZER", "TEST_ALARM", "UPDATE_THRESHOLD"]
    params: Optional[Dict[str, Any]] = Field(default_factory=lambda: {"duration_sec": 60})
