"""Add citizen wallet locks, encrypted file markers, photo and preferences."""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("citizen_accounts", sa.Column("settings", sa.JSON(), nullable=True))
    op.add_column("citizen_accounts", sa.Column("photo", sa.LargeBinary(), nullable=True))
    op.add_column("citizen_accounts", sa.Column("photo_mime", sa.String(30), nullable=True))
    op.add_column("citizen_accounts", sa.Column("mpin_hash", sa.String(200), nullable=True))
    op.add_column("citizen_accounts", sa.Column("wallet_attempts", sa.Integer(), server_default="0", nullable=False))
    op.add_column("citizen_accounts", sa.Column("wallet_retry_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("account_sessions", sa.Column("wallet_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("citizen_files", sa.Column("encryption_version", sa.Integer(), nullable=True))


def downgrade():
    connection = op.get_bind()
    protected_files = connection.execute(sa.text("SELECT COUNT(*) FROM citizen_files WHERE encryption_version IS NOT NULL")).scalar()
    protected_profiles = connection.execute(sa.text(
        "SELECT COUNT(*) FROM citizen_accounts WHERE photo IS NOT NULL OR CAST(profile AS TEXT) LIKE :marker"
    ), {"marker": '%"_protected_v1"%'}).scalar()
    if protected_files or protected_profiles:
        raise RuntimeError("Encrypted citizen data require revision 0004.")
    op.drop_column("citizen_files", "encryption_version")
    op.drop_column("account_sessions", "wallet_until")
    for name in ("wallet_retry_at", "wallet_attempts", "mpin_hash", "photo_mime", "photo", "settings"):
        op.drop_column("citizen_accounts", name)
