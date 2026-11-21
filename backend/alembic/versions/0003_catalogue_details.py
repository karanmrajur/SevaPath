"""Add catalogue provenance, application details and document inventory matching."""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("services", sa.Column("browse_category", sa.String(60), nullable=True))
    op.add_column("services", sa.Column("subcategory", sa.String(80), nullable=True))
    op.add_column("services", sa.Column("catalogue", sa.JSON(), nullable=True))
    op.create_index("ix_services_browse_category", "services", ["browse_category"])
    op.add_column("service_documents", sa.Column("inventory_category", sa.String(50), nullable=True))
    op.add_column("citizen_files", sa.Column("expires_on", sa.Date(), nullable=True))


def downgrade():
    op.drop_column("citizen_files", "expires_on")
    op.drop_column("service_documents", "inventory_category")
    op.drop_index("ix_services_browse_category", table_name="services")
    op.drop_column("services", "catalogue")
    op.drop_column("services", "subcategory")
    op.drop_column("services", "browse_category")
