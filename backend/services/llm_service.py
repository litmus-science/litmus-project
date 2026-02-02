"""
LLM Service abstraction for experiment translation.

Supports Anthropic, OpenAI, and OpenRouter providers,
configurable via environment variable.
"""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING

from backend.types import JsonObject

if TYPE_CHECKING:
    from anthropic import AsyncAnthropic
    from anthropic.types import MessageParam
    from openai import AsyncOpenAI
    from openai.types.chat import ChatCompletionMessageParam


@dataclass
class LLMResponse:
    """Response from an LLM provider."""

    content: str
    model: str
    usage: dict[str, int] | None = None
    raw_response: object | None = None


def _parse_json_object(payload: str) -> JsonObject:
    parsed = json.loads(payload)
    if isinstance(parsed, dict):
        return parsed
    raise ValueError("LLM response must be a JSON object.")


def _extract_anthropic_text(content: Sequence[object]) -> str:
    from anthropic.types import TextBlock

    texts = [block.text for block in content if isinstance(block, TextBlock)]
    if not texts:
        raise ValueError("Anthropic response content was empty.")
    return "".join(texts)


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
    ) -> JsonObject:
        """Generate a JSON response from the LLM."""
        pass


class AnthropicProvider(LLMProvider):
    """Anthropic Claude API provider."""

    def __init__(self, api_key: str | None = None, model: str = "claude-sonnet-4-20250514"):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")
        self.model = model
        self._client: AsyncAnthropic | None = None

    @property
    def client(self) -> AsyncAnthropic:
        if self._client is None:
            try:
                import anthropic

                self._client = anthropic.AsyncAnthropic(api_key=self.api_key)
            except ImportError:
                raise ImportError(
                    "anthropic package is required. Install with: pip install anthropic"
                )
        return self._client

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Generate a response using Claude."""
        messages: list[MessageParam] = [{"role": "user", "content": prompt}]
        if system_prompt:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=messages,
                system=system_prompt,
            )
        else:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=messages,
            )

        return LLMResponse(
            content=_extract_anthropic_text(response.content),
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
    ) -> JsonObject:
        """Generate a JSON response using Claude."""
        json_system = (
            system_prompt or ""
        ) + "\n\nYou must respond with valid JSON only. No other text."
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
        return _parse_json_object(content.strip())


class OpenAIProvider(LLMProvider):
    """OpenAI GPT API provider."""

    def __init__(self, api_key: str | None = None, model: str = "gpt-4o"):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        self.model = model
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
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
        messages: list[ChatCompletionMessageParam] = []
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
        content = choice.message.content
        if content is None:
            raise ValueError("OpenAI response content was empty.")
        return LLMResponse(
            content=content,
            model=response.model,
            usage={
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
            }
            if response.usage
            else None,
            raw_response=response,
        )

    async def generate_json(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> JsonObject:
        """Generate a JSON response using GPT with JSON mode."""
        messages: list[ChatCompletionMessageParam] = []
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
        if content is None:
            raise ValueError("OpenAI response content was empty.")
        return _parse_json_object(content)


class OpenRouterProvider(LLMProvider):
    """OpenRouter OpenAI-compatible provider."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY environment variable is required")
        self.model = model or os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o")
        self.base_url = base_url or os.environ.get(
            "OPENROUTER_BASE_URL",
            "https://openrouter.ai/api/v1",
        )
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            try:
                import openai

                self._client = openai.AsyncOpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url,
                )
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
        """Generate a response using OpenRouter."""
        messages: list[ChatCompletionMessageParam] = []
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
        content = choice.message.content
        if content is None:
            raise ValueError("OpenRouter response content was empty.")
        return LLMResponse(
            content=content,
            model=response.model,
            usage={
                "input_tokens": response.usage.prompt_tokens,
                "output_tokens": response.usage.completion_tokens,
            }
            if response.usage
            else None,
            raw_response=response,
        )

    async def generate_json(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> JsonObject:
        """Generate a JSON response using OpenRouter with JSON mode."""
        messages: list[ChatCompletionMessageParam] = []
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
        if content is None:
            raise ValueError("OpenRouter response content was empty.")
        return _parse_json_object(content)


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
            elif self.provider_name == "openrouter":
                self._provider = OpenRouterProvider()
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
    ) -> JsonObject:
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
