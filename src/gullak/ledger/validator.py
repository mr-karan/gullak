"""Validator for ledger-cli format files using ledger CLI."""

import asyncio
import tempfile
from pathlib import Path


class LedgerValidator:
    """Validate ledger files using the ledger-cli command."""

    def __init__(self, cli_path: str = "ledger"):
        """
        Initialize validator.

        Args:
            cli_path: Path to ledger CLI executable (ledger or hledger)
        """
        self.cli = cli_path

    async def validate_file(self, path: Path) -> tuple[bool, str]:
        """
        Validate a ledger file.

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not path.exists():
            return False, f"File not found: {path}"

        try:
            proc = await asyncio.create_subprocess_exec(
                self.cli,
                "-f",
                str(path),
                "balance",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()

            if proc.returncode == 0:
                return True, ""
            else:
                return False, stderr.decode().strip()

        except FileNotFoundError:
            return False, f"Ledger CLI not found: {self.cli}"
        except Exception as e:
            return False, f"Validation error: {e}"

    async def validate_content(self, content: str) -> tuple[bool, str]:
        """
        Validate ledger content string.

        Creates a temporary file for validation.

        Returns:
            Tuple of (is_valid, error_message)
        """
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".ledger",
            delete=False,
        ) as f:
            f.write(content)
            temp_path = Path(f.name)

        try:
            return await self.validate_file(temp_path)
        finally:
            temp_path.unlink(missing_ok=True)

    async def get_balance(
        self,
        path: Path,
        account: str = "",
        period: str = "",
    ) -> tuple[bool, str]:
        """
        Get balance for an account.

        Args:
            path: Path to ledger file
            account: Account pattern to filter (e.g., "Expenses:Food")
            period: Period filter (e.g., "this month")

        Returns:
            Tuple of (success, output_or_error)
        """
        if not path.exists():
            return False, "Ledger file not found"

        args = [self.cli, "-f", str(path), "balance"]

        if account:
            args.append(account)

        if period:
            args.extend(["--period", period])

        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode == 0:
                return True, stdout.decode().strip()
            else:
                return False, stderr.decode().strip()

        except Exception as e:
            return False, f"Balance query error: {e}"

    async def get_register(
        self,
        path: Path,
        account: str = "",
        period: str = "",
        limit: int = 50,
    ) -> tuple[bool, str]:
        """
        Get register (transaction history) for an account.

        Returns:
            Tuple of (success, output_or_error)
        """
        if not path.exists():
            return False, "Ledger file not found"

        args = [self.cli, "-f", str(path), "register"]

        if account:
            args.append(account)

        if period:
            args.extend(["--period", period])

        args.extend(["--tail", str(limit)])

        try:
            proc = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode == 0:
                return True, stdout.decode().strip()
            else:
                return False, stderr.decode().strip()

        except Exception as e:
            return False, f"Register query error: {e}"

    async def check_cli_available(self) -> bool:
        """Check if ledger CLI is available."""
        try:
            proc = await asyncio.create_subprocess_exec(
                self.cli,
                "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
            return proc.returncode == 0
        except FileNotFoundError:
            return False
