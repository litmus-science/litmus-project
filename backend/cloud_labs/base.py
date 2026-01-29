"""
Abstract base classes for cloud lab translators and providers.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Optional


class CloudLabError(Exception):
    """Base exception for cloud lab operations."""
    pass


class TranslationError(CloudLabError):
    """Error during protocol translation."""
    def __init__(self, message: str, field_path: str | None = None, suggestion: str | None = None):
        super().__init__(message)
        self.field_path = field_path
        self.suggestion = suggestion


class SubmissionError(CloudLabError):
    """Error during experiment submission."""
    pass


class SubmissionStatus(str, Enum):
    """Status of a cloud lab submission."""
    PENDING = "pending"
    SUBMITTED = "submitted"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ValidationIssue:
    """A validation warning or error."""
    path: str
    code: str
    message: str
    severity: str = "error"  # error, warning, info
    suggestion: str | None = None


@dataclass
class TranslationResult:
    """Result of translating a Litmus intake to cloud lab format."""
    provider: str
    format: str  # "sll" for ECL, "autoprotocol" for Strateos
    protocol: Any  # The translated protocol (SLL string or Autoprotocol dict)
    protocol_readable: str  # Human-readable version for preview
    success: bool = True
    errors: list[ValidationIssue] = field(default_factory=list)
    warnings: list[ValidationIssue] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "format": self.format,
            "protocol": self.protocol,
            "protocol_readable": self.protocol_readable,
            "success": self.success,
            "errors": [{"path": e.path, "code": e.code, "message": e.message, "suggestion": e.suggestion} for e in self.errors],
            "warnings": [{"path": w.path, "code": w.code, "message": w.message, "suggestion": w.suggestion} for w in self.warnings],
            "metadata": self.metadata,
        }


@dataclass
class SubmissionResult:
    """Result of submitting an experiment to a cloud lab."""
    success: bool
    submission_id: str | None = None
    provider_experiment_id: str | None = None
    status: SubmissionStatus = SubmissionStatus.PENDING
    estimated_completion: datetime | None = None
    message: str | None = None
    provider_response: dict[str, Any] = field(default_factory=dict)


@dataclass
class StatusResult:
    """Status of a submitted experiment."""
    submission_id: str
    status: SubmissionStatus
    progress_percent: float | None = None
    current_step: str | None = None
    started_at: datetime | None = None
    estimated_completion: datetime | None = None
    error_message: str | None = None


@dataclass
class ResultsData:
    """Results data from a completed experiment."""
    submission_id: str
    status: SubmissionStatus
    completed_at: datetime | None = None
    raw_data_urls: list[str] = field(default_factory=list)
    processed_data: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


class CloudLabTranslator(ABC):
    """
    Abstract base class for translating Litmus intake to cloud lab protocol format.

    Each cloud lab provider has its own translator that converts the standardized
    Litmus experiment intake JSON into the provider's native protocol format.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name (e.g., 'ecl', 'strateos')."""
        pass

    @property
    @abstractmethod
    def protocol_format(self) -> str:
        """Return the protocol format (e.g., 'sll', 'autoprotocol')."""
        pass

    @abstractmethod
    def supported_experiment_types(self) -> list[str]:
        """Return list of supported Litmus experiment types."""
        pass

    @abstractmethod
    def translate(self, intake: dict) -> TranslationResult:
        """
        Translate a Litmus intake specification to the cloud lab protocol format.

        Args:
            intake: The Litmus experiment intake JSON/dict

        Returns:
            TranslationResult containing the translated protocol and any validation issues
        """
        pass

    @abstractmethod
    def validate_intake(self, intake: dict) -> list[ValidationIssue]:
        """
        Validate that an intake can be translated for this provider.

        Args:
            intake: The Litmus experiment intake JSON/dict

        Returns:
            List of validation issues (errors and warnings)
        """
        pass

    def can_translate(self, intake: dict) -> bool:
        """Check if this translator can handle the given intake."""
        exp_type = intake.get("experiment_type", "")
        return exp_type in self.supported_experiment_types()


class CloudLabProvider(ABC):
    """
    Abstract base class for cloud lab API interactions.

    Each cloud lab provider has its own API client that handles authentication,
    submission, status polling, and results retrieval.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name."""
        pass

    @property
    @abstractmethod
    def base_url(self) -> str:
        """Return the API base URL."""
        pass

    @abstractmethod
    async def authenticate(self, credentials: dict) -> bool:
        """
        Authenticate with the cloud lab API.

        Args:
            credentials: Provider-specific credentials dict

        Returns:
            True if authentication successful
        """
        pass

    @abstractmethod
    async def submit_experiment(self, protocol: Any, metadata: dict | None = None) -> SubmissionResult:
        """
        Submit an experiment to the cloud lab.

        Args:
            protocol: The translated protocol (SLL or Autoprotocol)
            metadata: Optional metadata to attach to the submission

        Returns:
            SubmissionResult with submission ID and status
        """
        pass

    @abstractmethod
    async def get_status(self, submission_id: str) -> StatusResult:
        """
        Get the status of a submitted experiment.

        Args:
            submission_id: The internal submission ID

        Returns:
            StatusResult with current status and progress
        """
        pass

    @abstractmethod
    async def get_results(self, submission_id: str) -> ResultsData:
        """
        Get results from a completed experiment.

        Args:
            submission_id: The internal submission ID

        Returns:
            ResultsData with raw and processed data
        """
        pass

    @abstractmethod
    async def cancel_experiment(self, submission_id: str) -> bool:
        """
        Cancel a submitted experiment.

        Args:
            submission_id: The internal submission ID

        Returns:
            True if cancellation successful
        """
        pass

    @abstractmethod
    def required_credentials(self) -> list[str]:
        """Return list of required credential fields."""
        pass
