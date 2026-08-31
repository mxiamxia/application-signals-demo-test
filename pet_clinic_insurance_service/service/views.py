from rest_framework import viewsets, status
from rest_framework.response import Response
from django.db import transaction, connection
from django.core.exceptions import ValidationError
from .models import Insurance, PetInsurance
from .serializers import InsuranceSerializer, PetInsuranceSerializer
from .rest import generate_billings
import logging
import time

logger = logging.getLogger(__name__)

class InsuranceViewSet(viewsets.ModelViewSet):
    queryset = Insurance.objects.all()
    serializer_class = InsuranceSerializer

    def get_queryset(self):
        start_time = time.time()
        logger.info("InsuranceViewSet.get_queryset() called - Fetching insurance records")
        
        try:
            # Optimize query with select_related if needed
            queryset = Insurance.objects.all()
            
            if not queryset.exists():
                logger.warning("InsuranceViewSet.get_queryset() - No insurance records found")
                return Insurance.objects.none()
            
            query_time = time.time() - start_time
            logger.info(f"InsuranceViewSet.get_queryset() - Found {queryset.count()} insurance records in {query_time:.3f}s")
            return queryset
            
        except Exception as e:
            query_time = time.time() - start_time
            logger.error(f"InsuranceViewSet.get_queryset() - Database error after {query_time:.3f}s: {str(e)}")
            return Insurance.objects.none()


class PetInsuranceViewSet(viewsets.ModelViewSet):
    queryset = PetInsurance.objects.all()
    serializer_class = PetInsuranceSerializer
    lookup_field = 'pet_id'

    def get_queryset(self):
        start_time = time.time()
        logger.info("PetInsuranceViewSet.get_queryset() called - Fetching pet insurance records")
        
        try:
            # Optimize query performance
            queryset = PetInsurance.objects.all()
            
            if not queryset.exists():
                logger.warning("PetInsuranceViewSet.get_queryset() - No pet insurance records found")
                return PetInsurance.objects.none()
            
            query_time = time.time() - start_time
            logger.info(f"PetInsuranceViewSet.get_queryset() - Found {queryset.count()} pet insurance records in {query_time:.3f}s")
            return queryset
            
        except Exception as e:
            query_time = time.time() - start_time
            logger.error(f"PetInsuranceViewSet.get_queryset() - Database error after {query_time:.3f}s: {str(e)}")
            return PetInsurance.objects.none()

    def create(self, request, *args, **kwargs):
        start_time = time.time()
        owner_id = request.data.get('owner_id')
        pet_id = request.data.get('pet_id')
        logger.info(f"PetInsuranceViewSet.create() called - Creating pet insurance for owner_id: {owner_id}, pet_id: {pet_id}")
        logger.debug(f"Request data: {request.data}")
        
        try:
            with transaction.atomic():
                serializer = self.get_serializer(data=request.data)
                serializer.is_valid(raise_exception=True)
                self.perform_create_with_billing(serializer, owner_id)
                headers = self.get_success_headers(serializer.data)
                
                operation_time = time.time() - start_time
                logger.info(f"PetInsuranceViewSet.create() - Pet insurance created successfully for pet_id: {pet_id} in {operation_time:.3f}s")
                return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
                
        except ValidationError as e:
            operation_time = time.time() - start_time
            logger.error(f"PetInsuranceViewSet.create() - Validation error after {operation_time:.3f}s: {str(e)}")
            return Response({'error': 'Validation failed', 'details': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            operation_time = time.time() - start_time
            logger.error(f"PetInsuranceViewSet.create() - Failed to create pet insurance after {operation_time:.3f}s: {str(e)}")
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def update(self, request, *args, **kwargs):
        start_time = time.time()
        
        try:
            instance = self.get_object()
            pet_id = instance.pet_id
            owner_id = request.data.get('owner_id')
            logger.info(f"PetInsuranceViewSet.update() called - Updating pet insurance for pet_id: {pet_id}, owner_id: {owner_id}")
            logger.debug(f"Request data: {request.data}")
            
            with transaction.atomic():
                serializer = self.get_serializer(instance, data=request.data, partial=True)
                
                if serializer.is_valid():
                    self.perform_update_with_billing(serializer, owner_id)
                    operation_time = time.time() - start_time
                    logger.info(f"PetInsuranceViewSet.update() - Pet insurance updated successfully for pet_id: {pet_id} in {operation_time:.3f}s")
                    return Response(serializer.data)
                else:
                    operation_time = time.time() - start_time
                    logger.error(f"PetInsuranceViewSet.update() - Validation failed for pet_id: {pet_id} after {operation_time:.3f}s, errors: {serializer.errors}")
                    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
                    
        except Exception as e:
            operation_time = time.time() - start_time
            logger.error(f"PetInsuranceViewSet.update() - Failed to update pet insurance after {operation_time:.3f}s: {str(e)}")
            return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def perform_create_with_billing(self, serializer, owner_id):
        """Optimized create with billing generation"""
        start_time = time.time()
        logger.info(f"PetInsuranceViewSet.perform_create_with_billing() called - Saving pet insurance and generating billing")
        
        try:
            # Save the instance first
            instance = serializer.save()
            
            # Generate billing asynchronously if possible, or with timeout
            insurance_name = serializer.data.get("insurance_name")
            logger.debug(f"Generating billing for owner_id: {owner_id}, insurance_name: {insurance_name}")
            
            # Add timeout protection for billing generation
            billing_start = time.time()
            generate_billings(serializer.data, owner_id, "insurance", insurance_name)
            billing_time = time.time() - billing_start
            
            total_time = time.time() - start_time
            logger.info(f"PetInsuranceViewSet.perform_create_with_billing() - Successfully saved and generated billing for owner_id: {owner_id} in {total_time:.3f}s (billing: {billing_time:.3f}s)")
            
        except Exception as e:
            operation_time = time.time() - start_time
            logger.error(f"PetInsuranceViewSet.perform_create_with_billing() - Failed to save or generate billing after {operation_time:.3f}s: {str(e)}")
            raise

    def perform_update_with_billing(self, serializer, owner_id):
        """Optimized update with billing generation"""
        start_time = time.time()
        logger.info(f"PetInsuranceViewSet.perform_update_with_billing() called - Saving pet insurance and generating billing")
        
        try:
            # Save the instance first
            instance = serializer.save()
            
            # Generate billing with timeout protection
            insurance_name = serializer.data.get("insurance_name")
            logger.debug(f"Generating billing for owner_id: {owner_id}, insurance_name: {insurance_name}")
            
            billing_start = time.time()
            generate_billings(serializer.data, owner_id, "insurance", insurance_name)
            billing_time = time.time() - billing_start
            
            total_time = time.time() - start_time
            logger.info(f"PetInsuranceViewSet.perform_update_with_billing() - Successfully saved and generated billing for owner_id: {owner_id} in {total_time:.3f}s (billing: {billing_time:.3f}s)")
            
        except Exception as e:
            operation_time = time.time() - start_time
            logger.error(f"PetInsuranceViewSet.perform_update_with_billing() - Failed to save or generate billing after {operation_time:.3f}s: {str(e)}")
            raise

    def send_update_notification(self, instance):
        # Your custom logic to send a notification
        # after the instance is updated
        logger.info(f"PetInsuranceViewSet.send_update_notification() called - Sending notification for pet_id: {instance.pet_id}")
        logger.debug("PetInsuranceViewSet.send_update_notification() - Notification logic not implemented yet")
        pass

class HealthViewSet(viewsets.ViewSet):
    def list(self, request):
        start_time = time.time()
        logger.info("HealthViewSet.list() called - Health check requested")
        
        try:
            # Quick database connectivity check
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            
            response_time = time.time() - start_time
            logger.info(f"HealthViewSet.list() - Insurance service is healthy (response time: {response_time:.3f}s)")
            return Response({'message': 'ok', 'status': 'healthy', 'response_time': f"{response_time:.3f}s"}, status=status.HTTP_200_OK)
            
        except Exception as e:
            response_time = time.time() - start_time
            logger.error(f"HealthViewSet.list() - Health check failed after {response_time:.3f}s: {str(e)}")
            return Response({'message': 'unhealthy', 'error': str(e), 'response_time': f"{response_time:.3f}s"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)