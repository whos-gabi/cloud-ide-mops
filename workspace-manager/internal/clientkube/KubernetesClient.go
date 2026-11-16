package clientkube

import (
	"context"
	"errors"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv1 "k8s.io/api/autoscaling/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

type KubernetesClient struct {
	clientset kubernetes.Interface
}

// Takes the interface, so tests can pass k8s.io/client-go/kubernetes/fake.
func NewKubernetesClient(clientset kubernetes.Interface) (*KubernetesClient, error) {
	if clientset == nil {
		return nil, errors.New("kubernetes clientset cannot be nil")
	}

	return &KubernetesClient{clientset: clientset}, nil
}

func (k *KubernetesClient) CreateDeployment(
	ctx context.Context,
	namespace string,
	deployment *appsv1.Deployment,
) (*appsv1.Deployment, error) {
	if deployment == nil {
		return nil, errors.New("deployment cannot be nil")
	}

	return k.clientset.AppsV1().
		Deployments(namespace).
		Create(ctx, deployment, metav1.CreateOptions{})
}

func (k *KubernetesClient) GetDeployment(
	ctx context.Context,
	namespace string,
	name string,
) (*appsv1.Deployment, error) {
	return k.clientset.AppsV1().
		Deployments(namespace).
		Get(ctx, name, metav1.GetOptions{})
}

func (k *KubernetesClient) UpdateDeployment(
	ctx context.Context,
	namespace string,
	deployment *appsv1.Deployment,
) (*appsv1.Deployment, error) {
	if deployment == nil {
		return nil, errors.New("deployment cannot be nil")
	}

	return k.clientset.AppsV1().
		Deployments(namespace).
		Update(ctx, deployment, metav1.UpdateOptions{})
}

func (k *KubernetesClient) ScaleDeployment(
	ctx context.Context,
	namespace string,
	name string,
	replicas int32,
) error {
	if replicas < 0 {
		return errors.New("replicas cannot be negative")
	}

	scale, err := k.clientset.AppsV1().
		Deployments(namespace).
		GetScale(ctx, name, metav1.GetOptions{})
	if err != nil {
		return err
	}

	scale.Spec.Replicas = replicas

	_, err = k.clientset.AppsV1().
		Deployments(namespace).
		UpdateScale(ctx, name, &autoscalingv1.Scale{
			ObjectMeta: scale.ObjectMeta,
			Spec:       scale.Spec,
			Status:     scale.Status,
		}, metav1.UpdateOptions{})
	return err
}

func (k *KubernetesClient) DeleteDeployment(
	ctx context.Context,
	namespace string,
	name string,
) error {
	return k.clientset.AppsV1().
		Deployments(namespace).
		Delete(ctx, name, metav1.DeleteOptions{})
}

func (k *KubernetesClient) CreatePVC(
	ctx context.Context,
	namespace string,
	pvc *corev1.PersistentVolumeClaim,
) (*corev1.PersistentVolumeClaim, error) {
	if pvc == nil {
		return nil, errors.New("persistent volume claim cannot be nil")
	}

	return k.clientset.CoreV1().
		PersistentVolumeClaims(namespace).
		Create(ctx, pvc, metav1.CreateOptions{})
}

func (k *KubernetesClient) GetPVC(
	ctx context.Context,
	namespace string,
	name string,
) (*corev1.PersistentVolumeClaim, error) {
	return k.clientset.CoreV1().
		PersistentVolumeClaims(namespace).
		Get(ctx, name, metav1.GetOptions{})
}

func (k *KubernetesClient) UpdatePVC(
	ctx context.Context,
	namespace string,
	pvc *corev1.PersistentVolumeClaim,
) (*corev1.PersistentVolumeClaim, error) {
	if pvc == nil {
		return nil, errors.New("persistent volume claim cannot be nil")
	}

	return k.clientset.CoreV1().
		PersistentVolumeClaims(namespace).
		Update(ctx, pvc, metav1.UpdateOptions{})
}

func (k *KubernetesClient) DeletePVC(
	ctx context.Context,
	namespace string,
	name string,
) error {
	return k.clientset.CoreV1().
		PersistentVolumeClaims(namespace).
		Delete(ctx, name, metav1.DeleteOptions{})
}

func (k *KubernetesClient) CreateService(
	ctx context.Context,
	namespace string,
	service *corev1.Service,
) (*corev1.Service, error) {
	if service == nil {
		return nil, errors.New("service cannot be nil")
	}

	return k.clientset.CoreV1().
		Services(namespace).
		Create(ctx, service, metav1.CreateOptions{})
}

func (k *KubernetesClient) GetService(
	ctx context.Context,
	namespace string,
	name string,
) (*corev1.Service, error) {
	return k.clientset.CoreV1().
		Services(namespace).
		Get(ctx, name, metav1.GetOptions{})
}

func (k *KubernetesClient) UpdateService(
	ctx context.Context,
	namespace string,
	service *corev1.Service,
) (*corev1.Service, error) {
	if service == nil {
		return nil, errors.New("service cannot be nil")
	}

	return k.clientset.CoreV1().
		Services(namespace).
		Update(ctx, service, metav1.UpdateOptions{})
}

func (k *KubernetesClient) DeleteService(
	ctx context.Context,
	namespace string,
	name string,
) error {
	return k.clientset.CoreV1().
		Services(namespace).
		Delete(ctx, name, metav1.DeleteOptions{})
}
