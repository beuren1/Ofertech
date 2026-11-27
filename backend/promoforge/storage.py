from botocore.config import Config
from storages.backends.s3 import S3Storage


class PrivateS3Storage(S3Storage):
    default_acl = None
    file_overwrite = False
    custom_domain = None
    location = ''
    object_parameters = {'CacheControl': 'private, no-store'}
    client_config = Config(
        signature_version='s3v4',
        s3={'addressing_style': 'path'},
        connect_timeout=5,
        read_timeout=15,
        request_checksum_calculation='when_required',
        response_checksum_validation='when_required',
        retries={'mode': 'standard', 'total_max_attempts': 3},
    )

    def url(self, name, parameters=None, expire=None, http_method=None):
        raise NotImplementedError('Mídia privada é servida exclusivamente pela API autenticada.')

    def check_bucket(self):
        self.connection.meta.client.list_objects_v2(Bucket=self.bucket_name, MaxKeys=1)
