from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

# All historical data models have been removed.
# This application now only uses live data from TomTom APIs.
# No persistent storage of traffic metrics or chokepoints is needed.