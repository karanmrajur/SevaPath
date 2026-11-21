"""Citizen accounts, authenticated sessions, and private documents."""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "citizen_accounts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("anonymous_sessions.id"), unique=True, nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(254), unique=True, nullable=False),
        sa.Column("mobile", sa.String(10), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(200), nullable=False),
        sa.Column("profile", sa.JSON(), nullable=False),
        sa.Column("workspace", sa.JSON(), nullable=False),
        sa.Column("workspace_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "account_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("citizen_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_account_sessions_account_id", "account_sessions", ["account_id"])
    op.create_index("ix_account_sessions_expires_at", "account_sessions", ["expires_at"])
    op.create_table(
        "citizen_files",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.String(36), sa.ForeignKey("citizen_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(140), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("mime", sa.String(30), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("payload", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_citizen_files_account_id", "citizen_files", ["account_id"])


def downgrade():
    op.drop_table("citizen_files")
    op.drop_table("account_sessions")
    op.drop_table("citizen_accounts")
