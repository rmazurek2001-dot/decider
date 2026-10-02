import os

from .settings import *  # noqa: F401,F403

for _key in ('GEMINI_API_KEY', 'GOOGLE_API_KEY'):
    os.environ.pop(_key, None)

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}
