"""
LLM Service abstraction for experiment translation.

Supports both Anthropic Claude and OpenAI GPT-4 as providers,
configurable via environment variable.
"""

import os
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class LLMResponse:
    """Response from an LLM provider."""
    content: str
    model: str
    usage: dict[str, int] | None = None
    raw_response: Any = None


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate a response from the LLM."""
        pass

    @abstractmethod
    async def generate_json(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> dict:
        """Generate a JSON response from the LLM."""
        pass


class AnthropicProvider(LLMProvider):
    """Anthropic Claude API provider."""

    def __init__(self, api_key: str | None = None, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")
        self.model = model
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                import anthropic
                self._client = anthropic.AsyncAnthropic(api_key=self.api_key)
            except ImportError:
                raise ImportError("anthropic package is required. Install with: pip install anthropic")
        return self._client

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate a response using Claude."""
        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            kwargs["system"] = system_prompt

        response = await self.client.messages.create(**kwargs)

        return LLMResponse(
            content=response.content[0].text,
            model=response.model,
            usage={
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
            raw_response=response,
        )

    async def generate_json(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> dict:
        """Generate a JSON response using Claude."""
        json_system = (system_prompt or "") + "\n\nYou must respond with valid JSON only. No other text."
        response = await self.generate(
            prompt=prompt,
            system_prompt=json_system,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        # Extract JSON from response
        content = response.content.strip()
        # Handle markdown code blocks
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        return json.loads(content.strip())


class OpenAIProvider(LLMProvider):
    """OpenAI GPT API provider."""

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        self.model = model
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                import openai
                self._client = openai.AsyncOpenAI(api_key=self.api_key)
            except ImportError:
                raise ImportError("openai package is required. Install with: pip install openai")
        return self._client

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate a response using GPT."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        choice = response.choices[0]
        return LLMResponse(
            content=choice.message.content,
            model=response.model,
            usage={
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
            } if response.usage else None,
            raw_response=response,
        )

    async def generate_json(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> dict:
        """Generate a JSON response using GPT with JSON mode."""
        messages = []
        json_system = (system_prompt or "") + "\n\nYou must respond with valid JSON only."
        messages.append({"role": "system", "content": json_system})
        messages.append({"role": "user", "content": prompt})

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        return json.loads(content)


class LLMService:
    """
    Unified LLM service that supports multiple providers.

    Provider selection is based on LLM_PROVIDER environment variable.
    Defaults to 'anthropic'.
    """

    def __init__(self, provider: str | None = None):
        self.provider_name = provider or os.environ.get("LLM_PROVIDER", "anthropic")
        self._provider: LLMProvider | None = None

    @property
    def provider(self) -> LLMProvider:
        if self._provider is None:
            if self.provider_name == "anthropic":
                self._provider = AnthropicProvider()
            elif self.provider_name == "openai":
                self._provider = OpenAIProvider()
            else:
                raise ValueError(f"Unknown LLM provider: {self.provider_name}")
        return self._provider

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate a text response."""
        return await self.provider.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    async def generate_json(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> dict:
        """Generate a JSON response."""
        return await self.provider.generate_json(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )


# Singleton instance
_llm_service: LLMService | None = None


def get_llm_service() -> LLMService:
    """Get or create the LLM service singleton."""
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service
